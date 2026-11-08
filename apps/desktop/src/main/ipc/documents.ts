/**
 * Register validated documents IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
import { AiParseService } from '../services/ai-parse';
import { createPageRenderer } from '../../../resources/converter/ai-pages';
import { aiParseContract, aiParseProgressChannel } from '../../shared/ai-parse';
import type { ProviderRegistry } from '../providers';
import { importError } from '../../shared/import-error';
import { showAttachedMessage, ownerWindow } from '../dialogs';
import { DropTokens } from '../services/drop-tokens';
import { readFile } from "node:fs/promises";
import { LibraryService } from '../services/library';
import { tr } from "../i18n";
import { conversionStatus } from "../../shared/status";
import { app, dialog, ipcMain, clipboard, nativeImage } from "electron";
import { join, basename } from "node:path";
import { containedPath } from "../services/file-paths";
import { stat, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Store } from "../db";
import { DocumentService, documentFormats } from "../services/documents";
import { createConverter } from "../../../resources/converter";
import { documentProgressChannel, documentProgressSchema } from "../../shared/ipc";
import type { IpcChannel } from "../../shared/ipc";
import type { createIpcRegistrar } from "./register";

/** Register this subsystem through the validated IPC registrar; return cleanup for window teardown. */
export function registerDocumentsIpc(
  registrar: ReturnType<typeof createIpcRegistrar>,
  store: Store,
  implemented: Set<IpcChannel>,
  deleteDocument: (id: import("../../shared/domain").Document["id"], remove: () => Promise<void>) => Promise<void> = (_id, remove) => remove(),
  providers?:ProviderRegistry,
): (() => Promise<void>) & { resume: (id: import("../../shared/domain").Document["id"]) => void; waitForIdle:()=>Promise<void>; stopAi:(id:import("../../shared/domain").Document["id"])=>Promise<void>; importPath:DocumentService["importPath"]; get:DocumentService["get"]; read:DocumentService["read"] } {
  const aiOwners=new Map<string,Electron.WebContents>();
  const drops = new DropTokens();
  const library = new LibraryService(store, join(app.getPath("userData"), "library"));
  const userData = app.getPath("userData");
  const converter = createConverter({
    userData,
    idleMinutes: () => store.settings.get().converterIdleMinutes,
    authorizeDownload: async () => {
      if (store.settings.get().converterOffline) return false;
      const result = await showAttachedMessage({type:'question',message:tr('settings:download'),detail:tr('settings:converter_copy'),buttons:[tr('settings:offline'),tr('settings:download_retry')],defaultId:0,cancelId:0});
      return result.response === 1;
    },
    resources: app.isPackaged ? join(process.resourcesPath, "converter") : join(app.getAppPath(), "resources/converter"),
  });
  implemented.add('converter:mode');
  registrar.handle('converter:mode', async ({offline}) => {
    store.settings.set({...store.settings.get(),converterOffline:offline});
    if (!offline) await converter.ensureReady();
    return {ok:true};
  });
  const owners = new Map<string, Electron.WebContents>();
  const documents = new DocumentService({ store, userData, convert: converter.convert, onProgress: (documentId, message) => {
    const owner = owners.get(documentId);
    if (owner && !owner.isDestroyed()) owner.send(documentProgressChannel, documentProgressSchema.parse({ documentId, message, ...conversionStatus(message) }));
  } });
  const renderOriginal = createPageRenderer(converter.ensureReady, app.isPackaged ? join(process.resourcesPath,'converter') : join(app.getAppPath(),'resources/converter'));
  implemented.add('documents:originalPage');
  implemented.add('documents:copyContext');
  registrar.handle('documents:originalPage', async ({documentId,page}) => {
    const doc = documents.get(documentId);
    if (!doc || doc.status !== 'ready') throw new Error('Document unavailable');
    const root = join(userData,'library',doc.sourceHash);
    const source = containedPath(root,doc.sourcePath);
    if (doc.mime === 'application/pdf') {
      const result = await renderOriginal(source,page,AbortSignal.timeout(30_000));
      return {image:`data:image/png;base64,${result.image.toString('base64')}`,previewOnly:false};
    }
    if (page !== 1) throw new Error('Page outside document');
    let path = source;
    const previewOnly = !doc.mime.startsWith('image/');
    if (previewOnly) {
      if (process.platform !== 'darwin' || !/\.(pptx?|docx?)$/i.test(source)) throw new Error('Original preview unavailable');
      const cache = join(root,'original-preview');
      await mkdir(cache,{recursive:true,mode:0o700});
      await promisify(execFile)('/usr/bin/qlmanage',['-t','-s','1800','-o',cache,source],{timeout:20_000,maxBuffer:4096});
      path = containedPath(root,join(cache,basename(source)+'.png'));
    }
    if ((await stat(path)).size > 12 * 1024 * 1024) throw new Error('Image too large');
    const image = nativeImage.createFromBuffer(await readFile(path));
    if (image.isEmpty()) throw new Error('Original preview unavailable');
    const size = image.getSize();
    const bounded = Math.max(size.width,size.height)>2400 ? image.resize(size.width>=size.height?{width:2400}:{height:2400}) : image;
    return {image:`data:image/png;base64,${bounded.toPNG().toString('base64')}`,previewOnly};
  });
  registrar.handle('documents:copyContext', context => {
    if (!documents.get(context.documentId)) throw new Error('Document unavailable');
    const image = nativeImage.createFromDataURL(context.image);
    if (image.isEmpty()) throw new Error('Invalid image');
    clipboard.write({image,text:JSON.stringify({document:context.documentName,page:context.page,kind:context.kind})});
    return {ok:true};
  });
  const ai=providers ? new AiParseService(store,providers,createPageRenderer(converter.ensureReady,app.isPackaged ? join(process.resourcesPath,'converter') : join(app.getAppPath(),'resources/converter')),state=>{const owner=aiOwners.get(state.documentId);if(owner && !owner.isDestroyed())owner.send(aiParseProgressChannel,state);}) : undefined;
  if(ai) {
    for(const channel of Object.keys(aiParseContract) as (keyof typeof aiParseContract)[])implemented.add(channel);
    registrar.handle('aiParse:estimate',r=>ai.estimate(r));
    registrar.handle('aiParse:start',(r,event)=>{const owner=aiOwners.get(r.documentId);if(owner && owner!==event.sender && !owner.isDestroyed())throw new Error('ai_parse.owner');aiOwners.set(r.documentId,event.sender);return ai.start(r);});
    registrar.handle('aiParse:status',r=>ai.status(r.documentId));
    registrar.handle('aiParse:cancel',(r,event)=>{if(aiOwners.get(r.documentId)!==event.sender)throw new Error('ai_parse.owner');ai.cancel(r.documentId);return {ok:true};});
    registrar.handle('aiParse:use',async r=>{await ai.use(r.documentId,r.version);return {ok:true};});
    registrar.handle('aiParse:discard',async r=>{await ai.discard(r.documentId);return {ok:true};});
  }
  const captureDrop = (event: Electron.IpcMainEvent, paths: unknown) => {
    event.returnValue = [];
    if (event.senderFrame !== event.sender.mainFrame || !Array.isArray(paths) || paths.length > 100 || !paths.every(p => typeof p === 'string' && p.length < 4096)) return;
    event.returnValue = paths.map(path => drops.issue(path, event.senderFrame!));
  };
  ipcMain.on('vstudy:preload-drop', captureDrop);
  const channels = ["welcome:sampleDocument","documents:importSample", "documents:import", "documents:importPaths", "documents:list", "documents:get", "documents:read", "documents:retry", "documents:reconvert", "documents:delete"] as const;
  for (const channel of channels) implemented.add(channel);
  registrar.handle("welcome:sampleDocument", ({ language }) => readFile(
    app.isPackaged ? join(process.resourcesPath, "samples", `${language}.md`) : join(app.getAppPath(), "resources/samples", `${language}.md`), "utf8"));
  registrar.handle("documents:importSample", async ({ language }, event) => {
    const path = app.isPackaged ? join(process.resourcesPath, "samples", `${language}.md`) : join(app.getAppPath(), "resources/samples", `${language}.md`);
    const document = await documents.importPath(path); store.db.prepare('UPDATE documents SET title=? WHERE id=?').run(tr('common:sample_title'),document.id); owners.set(document.id, event.sender); return documents.get(document.id)!;
  });
  registrar.handle("documents:import", async ({ folderId }, event) => {
    const result = await dialog.showOpenDialog(ownerWindow(event.sender), {
      title:tr("picker:import_title"), buttonLabel:tr("picker:import_title"),
      properties: ["openFile", "multiSelections"],
      filters: [{ name: tr("picker:documents"), extensions: Object.keys(documentFormats) }],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const imported = []; const errors: unknown[] = [];
    for (const selected of result.filePaths.slice(0,100)) {
      try { const document = await documents.importPath(selected); owners.set(document.id, event.sender); if (folderId !== undefined) library.move([document.id], folderId); imported.push(document); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw errors[0];
    return imported[0] ?? null;
  });
  registrar.handle("documents:importPaths", ({ paths, folderId }, event) => Promise.all(paths.map(async (path) => { try { const document = await documents.importPath(drops.consume(path, event.senderFrame!)); owners.set(document.id, event.sender); if (folderId !== undefined) library.move([document.id], folderId); return { ok: true as const, document }; } catch (error) { return { ok: false as const, path, error: 'VSTUDY_STATUS:' + JSON.stringify(importError(error)) }; } })));
  registrar.handle("documents:list", () => documents.list());
  registrar.handle("documents:get", ({ documentId }) => documents.get(documentId));
  registrar.handle("documents:read", ({ documentId, version }) => documents.read(documentId,version));
  registrar.handle("documents:reconvert",async({documentId},event)=>{ai?.cancel(documentId);await ai?.waitForIdle();owners.set(documentId,event.sender);return documents.reconvert(documentId);});
  registrar.handle("documents:retry", ({ documentId }, event) => { owners.set(documentId, event.sender); return documents.retry(documentId); });
  registrar.handle("documents:delete", async ({ documentId }) => {
    ai?.cancel(documentId); await ai?.waitForIdle();
    await deleteDocument(documentId, () => documents.delete(documentId));
    return { ok: true };
  });
  const dispose = registrar.dispose;
  return Object.assign(async () => { await ai?.dispose(); ipcMain.removeListener('vstudy:preload-drop', captureDrop); documents.dispose(); dispose(); await converter.dispose(); await documents.waitForIdle(); }, {waitForIdle:async()=>{await ai?.waitForIdle();await documents.waitForIdle();},importPath:documents.importPath.bind(documents),get:documents.get.bind(documents),read:documents.read.bind(documents),stopAi:async(id:import("../../shared/domain").Document["id"])=>{ai?.cancel(id);await ai?.waitForIdle();},resume: (id: import("../../shared/domain").Document["id"]) => documents.resume(id)});
}
