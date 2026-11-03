import { readFile } from "node:fs/promises";
import { LibraryService } from '../services/library';
import { tr } from "../i18n";
import { conversionStatus } from "../../shared/status";
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
): () => Promise<void> {
  const library = new LibraryService(store, join(app.getPath("userData"), "library"));
  const userData = app.getPath("userData");
  const converter = createConverter({
    userData,
    resources: app.isPackaged ? join(process.resourcesPath, "converter") : join(app.getAppPath(), "resources/converter"),
  });
  void converter.ensureReady().catch(() => undefined);
  const owners = new Map<string, Electron.WebContents>();
  const documents = new DocumentService({ store, userData, convert: converter.convert, onProgress: (documentId, message) => {
    const owner = owners.get(documentId);
    if (owner && !owner.isDestroyed()) owner.send(documentProgressChannel, documentProgressSchema.parse({ documentId, message, ...conversionStatus(message) }));
  } });
  const channels = ["welcome:sampleDocument","documents:importSample", "documents:import", "documents:importPaths", "documents:list", "documents:get", "documents:read", "documents:retry", "documents:reconvert", "documents:delete"] as const;
  for (const channel of channels) implemented.add(channel);
  registrar.handle("welcome:sampleDocument", ({ language }) => readFile(
    app.isPackaged ? join(process.resourcesPath, "samples", `${language}.md`) : join(app.getAppPath(), "resources/samples", `${language}.md`), "utf8"));
  registrar.handle("documents:importSample", async ({ language }, event) => {
    const path = app.isPackaged ? join(process.resourcesPath, "samples", `${language}.md`) : join(app.getAppPath(), "resources/samples", `${language}.md`);
    const document = await documents.importPath(path); owners.set(document.id, event.sender); return document;
  });
  registrar.handle("documents:import", async ({ folderId }, event) => {
    const result = await dialog.showOpenDialog({
      title:tr("picker:import_title"), buttonLabel:tr("picker:import_title"),
      properties: ["openFile"],
      filters: [{ name: tr("picker:documents"), extensions: Object.keys(documentFormats) }],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const document = await documents.importPath(path); owners.set(document.id, event.sender); if (folderId !== undefined) library.move([document.id], folderId); return document;
  });
  registrar.handle("documents:importPaths", ({ paths, folderId }, event) => Promise.all(paths.map(async (path) => { try { const document = await documents.importPath(path); owners.set(document.id, event.sender); if (folderId !== undefined) library.move([document.id], folderId); return { ok: true as const, document }; } catch { return { ok: false as const, path, error: "Import failed" }; } })));
  registrar.handle("documents:list", () => documents.list());
  registrar.handle("documents:get", ({ documentId }) => documents.get(documentId));
  registrar.handle("documents:read", ({ documentId }) => documents.read(documentId));
  registrar.handle("documents:reconvert",({documentId},event)=>{owners.set(documentId,event.sender);return documents.reconvert(documentId);});
  registrar.handle("documents:retry", ({ documentId }, event) => { owners.set(documentId, event.sender); return documents.retry(documentId); });
  registrar.handle("documents:delete", async ({ documentId }) => {
    await deleteDocument(documentId, () => documents.delete(documentId));
    return { ok: true };
  });
  const dispose = registrar.dispose;
  return async () => { documents.dispose(); dispose(); await converter.dispose(); };
}
