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
  app: { getPath: () => mock.userData, getAppPath: () => process.cwd(), isPackaged: false },
  dialog: { showOpenDialog: mock.dialog },
}));
vi.mock("../../../resources/converter", async (original) => ({
  ...await original<typeof import("../../../resources/converter")>(),
  createConverter: () => ({ ensureReady: async () => "python", dispose: () => undefined, convert: async (_source: string, output: string, progress?: (message: string) => void) => { await new Promise<void>(resolve => { mock.resume = resolve; }); progress?.("Installing markitdown…"); await writeFile(output, "converted"); } }),
}));
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
  const sender = { isDestroyed: () => false, send };
  const invoke = async (channel: string, payload: unknown) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error("Missing handler");
    return handler({ sender } as unknown as IpcMainInvokeEvent, payload);
  };
  try {
    expect(implemented.size).toBe(7);
    mock.dialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await invoke("documents:import", {})).toBeNull();
    mock.dialog.mockResolvedValueOnce({ canceled: false, filePaths: [resolve("test-fixtures/converter/sample.md")] });
    const document = documentSchema.parse(await invoke("documents:import", {}));
    expect(mock.dialog).toHaveBeenLastCalledWith(expect.objectContaining({
      filters: [expect.objectContaining({ extensions: expect.arrayContaining(["docx", "pdf", "md", "csv"]) })],
    }));
    await vi.waitFor(() => { expect(store.documents.get(document.id)?.status).toBe("ready"); });
    expect(await invoke("documents:read", { documentId: document.id })).toContain("VStudy fixture");
    expect(await invoke("documents:get", { documentId: document.id })).toMatchObject({ id: document.id });
    expect(await invoke("documents:list", {})).toHaveLength(1);
    expect(await invoke("documents:importPaths", { paths: [resolve("test-fixtures/converter/sample.md")] })).toHaveLength(1);
    const mixed = await invoke("documents:importPaths", { paths: ["missing.unsupported", resolve("test-fixtures/converter/sample.md")] }) as { ok: boolean; error?: string }[];
    expect(mixed.map(r => r.ok)).toEqual([false, true]);
    expect(mixed[0]?.error).toBe("Unsupported document type");
    const converted = await invoke("documents:importPaths", { paths: [resolve("test-fixtures/converter/sample.docx")] }) as { document: { id: string } }[];
    await vi.waitFor(() => expect(mock.resume).toBeTypeOf("function"));
    mock.resume!();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith("documents:progress", { documentId: converted[0]!.document.id, message: "Installing markitdown…", code:"library.conversion_preparing", params:{} }));
    for (const call of send.mock.calls) expect(() => documentProgressSchema.parse(call[1])).not.toThrow();
    await expect(invoke("documents:importPaths", { paths: [] })).rejects.toThrow();
    await expect(invoke("documents:importPaths", { paths: [12] })).rejects.toThrow();
    await expect(invoke("documents:importPaths", { paths: ["file.md"], extra: true })).rejects.toThrow();
    await expect(invoke("documents:retry", { documentId: document.id })).rejects.toThrow("Only failed");
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
