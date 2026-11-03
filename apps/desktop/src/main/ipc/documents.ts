import { app, dialog } from "electron";
import { join } from "node:path";
import type { Store } from "../db";
import { DocumentService, documentFormats } from "../services/documents";
import { createConverter } from "../../../resources/converter";
import { documentProgressChannel, documentProgressSchema } from "../../shared/ipc";
import type { IpcChannel } from "../../shared/ipc";
import type { createIpcRegistrar } from "./register";

export function registerDocumentsIpc(
  registrar: ReturnType<typeof createIpcRegistrar>,
  store: Store,
  implemented: Set<IpcChannel>,
  deleteDocument: (id: import("../../shared/domain").Document["id"], remove: () => Promise<void>) => Promise<void> = (_id, remove) => remove(),
): void {
  const userData = app.getPath("userData");
  const converter = createConverter({
    userData,
    resources: app.isPackaged ? join(process.resourcesPath, "converter") : join(app.getAppPath(), "resources/converter"),
  });
  const owners = new Map<string, Electron.WebContents>();
  const documents = new DocumentService({ store, userData, convert: converter.convert, onProgress: (documentId, message) => {
    const owner = owners.get(documentId);
    if (owner && !owner.isDestroyed()) owner.send(documentProgressChannel, documentProgressSchema.parse({ documentId, message }));
  } });
  const channels = ["documents:import", "documents:importPaths", "documents:list", "documents:get", "documents:read", "documents:retry", "documents:delete"] as const;
  for (const channel of channels) implemented.add(channel);
  registrar.handle("documents:import", async (_input, event) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Documents", extensions: Object.keys(documentFormats) }],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const document = await documents.importPath(path); owners.set(document.id, event.sender); return document;
  });
  registrar.handle("documents:importPaths", ({ paths }, event) => Promise.all(paths.map(async (path) => { try { const document = await documents.importPath(path); owners.set(document.id, event.sender); return { ok: true as const, document }; } catch (error) { return { ok: false as const, path, error: error instanceof Error ? error.message : "Import failed" }; } })));
  registrar.handle("documents:list", () => documents.list());
  registrar.handle("documents:get", ({ documentId }) => documents.get(documentId));
  registrar.handle("documents:read", ({ documentId }) => documents.read(documentId));
  registrar.handle("documents:retry", ({ documentId }, event) => { owners.set(documentId, event.sender); return documents.retry(documentId); });
  registrar.handle("documents:delete", async ({ documentId }) => {
    await deleteDocument(documentId, () => documents.delete(documentId));
    return { ok: true };
  });
  const dispose = registrar.dispose;
  registrar.dispose = () => { documents.dispose(); dispose(); };
}
