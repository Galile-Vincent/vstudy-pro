/**
 * Regression coverage for ipc documents.
 * Owned by main/ipc.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { documentSchema } from "../../shared/domain";
import { documentProgressSchema } from "../../shared/ipc";
import type { IpcChannel } from "../../shared/ipc";
import { openStore } from "../db";
import { createIpcRegistrar } from "./register";

const mock = vi.hoisted(() => ({ userData: "", dialog: vi.fn(), resume: undefined as (() => void) | undefined }));
vi.mock("electron", () => ({
  ipcMain: {on:vi.fn(),removeListener:vi.fn()},
  app: { getPath: () => mock.userData, getAppPath: () => process.cwd(), isPackaged: false },
  dialog: { showOpenDialog: mock.dialog },
}));
vi.mock("../../../resources/converter", async (original) => ({
  ...await original<typeof import("../../../resources/converter")>(),
  createConverter: () => ({ ensureReady: async () => "python", dispose: () => undefined, convert: async (_source: string, output: string, progress?: (message: string) => void) => { await new Promise<void>(resolve => { mock.resume = resolve; }); progress?.("Installing markitdown…"); await writeFile(output, "converted"); } }),
}));
import { ipcMain } from "electron";
import { registerDocumentsIpc } from "./documents";

afterEach(() => { vi.clearAllMocks(); });
it("registers document routes, validates drop paths, owns the native dialog and disposes", async () => {
  mock.userData = await mkdtemp(join(tmpdir(), "vstudy-documents-ipc-"));
  const store = openStore(":memory:");
  const handlers = new Map<string, (event: IpcMainInvokeEvent, request: unknown) => unknown>();
  const registrar = createIpcRegistrar({
    handle: (channel, callback) => { handlers.set(channel, callback); },
    removeHandler: (channel) => { handlers.delete(channel); },
  }, () => true);
  const implemented = new Set<IpcChannel>();
  const abort = vi.fn();
  registerDocumentsIpc(registrar, store, implemented, async (id, remove) => { abort(id); await remove(); });
  const send = vi.fn();
  const mainFrame = {};
  const sender = { mainFrame, isDestroyed: () => false, send };
  const invoke = async (channel: string, payload: unknown) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error("Missing handler");
    return handler({ sender, senderFrame:mainFrame } as unknown as IpcMainInvokeEvent, payload);
  };
  const token = (path:string) => {
    const listener=vi.mocked(ipcMain.on).mock.calls.find(c=>c[0]==='vstudy:preload-drop')![1];
    const event={sender,senderFrame:mainFrame,returnValue:[]};
    listener(event as unknown as Electron.IpcMainEvent,[path]);
    return (event.returnValue as string[])[0]!;
  };
  try {
    expect(implemented).toContain("documents:importSample");
    const before = store.documents.list().length;
    expect(await invoke("welcome:sampleDocument", { language: "ja" })).toContain("小さな疑問");
    expect(store.documents.list().length).toBe(before);
    await expect(invoke("welcome:sampleDocument", { language: "../../escape" })).rejects.toThrow();
    await expect(invoke("welcome:sampleDocument", { language: "en", path: "/tmp/secret" })).rejects.toThrow();
    mock.dialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await invoke("documents:import", {})).toBeNull();
    mock.dialog.mockResolvedValueOnce({ canceled: false, filePaths: [resolve("test-fixtures/converter/sample.md")] });
    const document = documentSchema.parse(await invoke("documents:import", {}));
    expect(mock.dialog).toHaveBeenLastCalledWith(expect.objectContaining({
      properties: ["openFile","multiSelections"],
      filters: [expect.objectContaining({ extensions: expect.arrayContaining(["docx", "pdf", "md", "csv"]) })],
    }));
    await vi.waitFor(() => { expect(store.documents.get(document.id)?.status).toBe("ready"); });
    expect(await invoke("documents:read", { documentId: document.id })).toContain("VStudy fixture");
    expect(await invoke("documents:get", { documentId: document.id })).toMatchObject({ id: document.id });
    expect(await invoke("documents:list", {})).toHaveLength(1);
    store.db.prepare('UPDATE documents SET deletedAt=? WHERE id=?').run(new Date(Date.now()-31_000).toISOString(),document.id);
    expect(await invoke("documents:get", {documentId:document.id})).toBeNull();
    mock.dialog.mockResolvedValueOnce({canceled:false,filePaths:[resolve("test-fixtures/converter/sample.md")]});
    expect(await invoke("documents:import", {})).toMatchObject({id:document.id,status:"ready"});
    expect(await invoke("documents:read", {documentId:document.id})).toContain("VStudy fixture");
    expect(await invoke("documents:importPaths", { paths: [token(resolve("test-fixtures/converter/sample.md"))] })).toHaveLength(1);
    const mixed = await invoke("documents:importPaths", { paths: [token("missing.unsupported"), token(resolve("test-fixtures/converter/sample.md"))] }) as { ok: boolean; error?: string }[];
    expect(mixed.map(r => r.ok)).toEqual([false, true]);
    expect(mixed[0]?.error).toBe('VSTUDY_STATUS:{"code":"errors.unsupported_type","params":{}}');
    const converted = await invoke("documents:importPaths", { paths: [token(resolve("test-fixtures/converter/sample.docx"))] }) as { document: { id: string } }[];
    await vi.waitFor(() => expect(mock.resume).toBeTypeOf("function"));
    mock.resume!();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith("documents:progress", { documentId: converted[0]!.document.id, message: "Installing markitdown…", code:"library.conversion_preparing", params:{} }));
    for (const call of send.mock.calls) expect(() => documentProgressSchema.parse(call[1])).not.toThrow();
    await expect(invoke("documents:importPaths", { paths: [] })).rejects.toThrow();
    await expect(invoke("documents:importPaths", { paths: [12] })).rejects.toThrow();
    await expect(invoke("documents:importPaths", { paths: ["file.md"], extra: true })).rejects.toThrow();
    await expect(invoke("documents:retry", { documentId: document.id })).rejects.toThrow("VSTUDY_STATUS:");
    const sample = documentSchema.parse(await invoke("documents:importSample", { language: "ja" }));
    expect(sample.title).toBe("Reading sample");
    await vi.waitFor(() => expect(store.documents.get(sample.id)?.status).toBe("ready"));
    expect(await invoke("documents:read", { documentId: sample.id })).toContain("小さな疑問");
    await expect(invoke("documents:importSample", { language: "../../escape" })).rejects.toThrow();
    expect(await invoke("documents:delete", { documentId: document.id })).toEqual({ ok: true });
    expect(abort.mock.calls[0]).toEqual([document.id]);
    expect(await invoke("documents:get", { documentId: document.id })).toBeNull();
  } finally {
    registrar.dispose();
    store.close();
    await rm(mock.userData, { recursive: true, force: true });
  }
  expect(handlers.size).toBe(0);
});
