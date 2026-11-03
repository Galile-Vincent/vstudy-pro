import { app, dialog } from "electron";
import { join } from "node:path";
import type { Store } from "../db";
import { DocumentService, documentFormats } from "../services/documents";
import { createConverter } from "../../../resources/converter";
import type { IpcChannel } from "../../shared/ipc";
import type { createIpcRegistrar } from "./register";

export function registerDocumentsIpc(
  registrar: ReturnType<typeof createIpcRegistrar>,
  store: Store,
  implemented: Set<IpcChannel>,
): void {
  const userData = app.getPath("userData");
  const converter = createConverter({
    userData,
    resources: app.isPackaged ? join(process.resourcesPath, "converter") : join(app.getAppPath(), "resources/converter"),
  });
  const documents = new DocumentService({ store, userData, convert: converter.convert });
  const channels = ["documents:import", "documents:importPaths", "documents:list", "documents:get", "documents:read", "documents:retry", "documents:delete"] as const;
  for (const channel of channels) implemented.add(channel);
  registrar.handle("documents:import", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Documents", extensions: Object.keys(documentFormats) }],
    });
    const path = result.filePaths[0];
    return result.canceled || !path ? null : documents.importPath(path);
  });
  registrar.handle("documents:importPaths", ({ paths }) => Promise.all(paths.map((path) => documents.importPath(path))));
  registrar.handle("documents:list", () => documents.list());
  registrar.handle("documents:get", ({ documentId }) => documents.get(documentId));
  registrar.handle("documents:read", ({ documentId }) => documents.read(documentId));
  registrar.handle("documents:retry", ({ documentId }) => documents.retry(documentId));
  registrar.handle("documents:delete", async ({ documentId }) => {
    await documents.delete(documentId);
    return { ok: true };
  });
  const dispose = registrar.dispose;
  registrar.dispose = () => { documents.dispose(); dispose(); };
}
