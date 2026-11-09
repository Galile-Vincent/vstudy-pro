import { WebChats } from '../web-chat/views';
import { getReviewAdmission } from '../review/admission';
import { installReviewAdmission } from '../review/admission-port';
import { startMemory } from '../review/memory';
import { registerReviewGenerateIpc } from './review-generate';
import { registerReviewIpc } from "./review";
import { reviewWorkers } from "../review/workers";
import { analytics } from '../analytics/service';
import { registerNewsletterIpc } from './newsletter';
import { registerAnalyticsIpc, type NewsletterConsentHook } from './analytics';
/**
 * Register validated index IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
import { registerAiCliIpc } from "./ai-cli";
import { registerPlannerIpc } from "./planner";
import { join } from "node:path";
import { createMcpBackend } from "../mcp/backend";
import { createMcpRuntime } from "../mcp/runtime";
import { createAgentNavigation } from "../mcp/navigation";
import { createAgentClientSetup } from "../mcp/client-setup";
import { registerMcpIpc } from "./mcp";
import { PlannerRepository } from "../planner/repository";
import { plannerCalendar } from "../planner/calendar";
import { exportText } from "../services/export-file";
import { log } from "../logging";
import type { McpTransportFactory, McpStatePersistence } from "../../shared/mcp-platform";
import { registerStorageIpc } from "./storage";
import { applyNativeTheme } from '../theme';
import { registerMoodleIpc } from './moodle';
import { showAttachedMessage, ownerWindow } from '../dialogs';
import { disposeSearchWorkers } from '../services/search-runner';
import { disposeDiscovery } from '../providers/models';
import { networkActivity, recordEgress } from '../services/egress';
import { ExecutablePins, setExecutablePins } from '../providers/executable-pins';
import { tr, updateApplicationMenu } from "../i18n";
import { registerLibraryIpc } from "./library";
import { registerUsageIpc } from "./usage";
import { createProviderRegistry } from "../providers";
import { app, type BrowserWindow, dialog, nativeTheme, shell, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { Store } from "../db";
import type { SecretStore } from "../services/secrets";
import { ipcContract, type IpcChannel } from "../../shared/ipc";
import { createIpcRegistrar } from "./register";
import { registerDocumentsIpc } from "./documents";
import { registerChatIpc } from "./chat";

/** App-owned transport and packaged paths are injected only by the composition root. */
export interface AppIpcOptions {
  updates?: import('../updates/service').Updates;
  newsletterConsent?:NewsletterConsentHook;
  moodleRequest?:typeof fetch;
  mcpPaths?:{peerHelper?:string;serverBin:string};
  mcpTransport?:McpTransportFactory;
  mcpPersistence?:McpStatePersistence|(()=>McpStatePersistence|undefined);
}

/** Register this subsystem through the validated IPC registrar; return cleanup for window teardown. */
export function registerIpc(
  store: Store,
  secrets: SecretStore,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  restoreMainWindow: () => BrowserWindow | undefined | Promise<BrowserWindow | undefined> = () => undefined,
  options:AppIpcOptions = {},
): () => Promise<void> {
  const pins = new ExecutablePins(`${app.getPath('userData')}/executable-pins.json`, async (previous, current) => {
    const result = await showAttachedMessage({type:'warning', message:tr('settings:binary_changed'), detail:tr('settings:binary_detail',{previous:previous.path,current:current.path,hash:current.hash,mtime:new Date(current.mtime).toISOString()}), buttons:[tr('common:cancel'),tr('settings:allow')],defaultId:0,cancelId:0});
    return result.response === 1;
  });
  setExecutablePins(pins);
  const providers = createProviderRegistry(secrets, `${app.getPath("userData")}/providers.json`);
  const registrar = createIpcRegistrar(ipcMain, isTrusted);
  registrar.handle('app:reportError', report => { log({phase:`renderer-${report.phase}`,code:report.code,componentStack:report.componentStack}); return {ok:true}; });
  const implemented = new Set<IpcChannel>([
    'app:reportError',
    "shell:openExternal",
    "settings:appearance",
    "settings:systemLocale",
    "settings:get",
    "settings:set",
    "secrets:set",
    "secrets:has",
    "secrets:delete",
  ]);
  const telemetry=analytics();
  registerNewsletterIpc(registrar, implemented);
  if (telemetry) registerAnalyticsIpc(registrar,implemented,telemetry,options.newsletterConsent);
  const confirmExternal = async (owner:Electron.WebContents, url:string) => {
    const target = new URL(url);
    const result = await showAttachedMessage({ type: 'question', message: tr("settings:external",{target:target.hostname || target.protocol}), detail: target.protocol === 'mailto:' ? tr('settings:mail_detail',{address:decodeURIComponent(target.pathname),subject:target.searchParams.get('subject') ?? '',length:(target.searchParams.get('body') ?? '').length,url}) : url, buttons: [tr('common:cancel'), tr('common:open')], defaultId: 0, cancelId: 0 }, owner);
    if (result.response === 1 && !owner.isDestroyed()) { recordEgress('external_open', target.protocol === 'mailto:' ? 'Default mail application' : target.origin); await shell.openExternal(url); }
  };
  const updates = options.updates;
  const updateOwners = new Set<IpcMainInvokeEvent>();
  const stopUpdates = updates?.subscribe(snapshot => {
    for (const event of updateOwners) {
      if (event.sender.isDestroyed() || !isTrusted(event)) updateOwners.delete(event);
      else event.sender.send('updates:state', snapshot);
    }
  });
  if (updates) {
    for (const channel of ['updates:state', 'updates:check', 'updates:download',
      'updates:install', 'updates:setAuto', 'updates:notes'] as const) implemented.add(channel);
    registrar.handle('updates:state', (_request, event) => {
      for (const prior of updateOwners) if (prior.sender === event.sender) updateOwners.delete(prior);
      updateOwners.add(event); return updates.snapshot();
    });
    registrar.handle('updates:check', () => updates.check());
    const updateConsent = async (event:IpcMainInvokeEvent, action:'download' | 'install') => {
      const result = await showAttachedMessage({type:'question',message:tr(`updates:confirm_${action}`),
        detail:tr('updates:confirm_detail'),buttons:[tr('common:cancel'),tr('updates:continue')],
        defaultId:0,cancelId:0}, event.sender);
      return result.response === 1 && !event.sender.isDestroyed();
    };
    registrar.handle('updates:download', async (_request,event) =>
      await updateConsent(event,'download') ? updates.download() : updates.snapshot());
    let installing = false;
    registrar.handle('updates:install', async (_request,event) => {
      if (installing || updates.snapshot().installing || updates.snapshot().state.status !== 'ready') return updates.snapshot();
      installing = true;
      try {
        if (!await updateConsent(event,'install')) return updates.snapshot();
        await disposeMoodle.waitForIdle(); await chat.waitForIdle();
        await disposeDocuments.waitForIdle(); await disposeLibrary.waitForIdle();
        return updates.install();
      } finally { installing = false; }
    });
    registrar.handle('updates:setAuto', ({enabled}) => updates.setAuto(enabled));
    registrar.handle('updates:notes', async (_request, event) => {
      const state = updates.snapshot().state;
      if (state.status === 'available') await confirmExternal(event.sender, state.releaseUrl);
      return {ok:true};
    });
  }
  registrar.handle('shell:openExternal' , async ({url},event)=>{await confirmExternal(event.sender,url);return {ok:true};});
  const webChats=new WebChats(confirmExternal);
  for(const channel of ['web-chat:open','web-chat:state','web-chat:layout','web-chat:action','web-chat:clear','web-chat:hide','web-chat:sync'] as const) implemented.add(channel);
  registrar.handle('web-chat:sync',({tabIds},event)=>webChats.sync(event.sender,tabIds));
  registrar.handle('web-chat:hide',({provider,tabId,slotId,generation},event)=>{webChats.hide(event.sender,provider,tabId,slotId,generation);return {ok:true};});
  registrar.handle('web-chat:open',({provider,tabId,slotId,url},event)=>webChats.open(event.sender,provider,tabId,slotId,url));
  registrar.handle('web-chat:state',({provider,tabId,slotId},event)=>webChats.state(event.sender,provider,tabId,slotId));
  registrar.handle('web-chat:layout',({provider,bounds,visible,radius,active,tabId,slotId,generation},event)=>{webChats.layout(event.sender,provider,bounds,visible,radius,active,tabId,slotId,generation);return {ok:true};});
  registrar.handle('web-chat:action',({provider,action,tabId,slotId},event)=>webChats.action(event.sender,provider,action,tabId,slotId));
  registrar.handle('web-chat:clear',async({provider},event)=>{await webChats.clear(event.sender,provider);return {ok:true};});
  implemented.add('providers:chooseExecutable');
  registrar.handle('providers:chooseExecutable', async ({binary},event) => {
    const result = await dialog.showOpenDialog(ownerWindow(event.sender), {title:tr('settings:choose_binary',{binary}),properties:['openFile']});
    return {path: result.canceled || !result.filePaths[0] ? null : await pins.choose(binary,result.filePaths[0])};
  });
  implemented.add('settings:networkActivity');
  registrar.handle('settings:networkActivity', () => networkActivity());
  implemented.add('secrets:unlock'); implemented.add('secrets:session');
  registrar.handle('secrets:unlock', async ({providerId}) => { await secrets.getInMainOnly(providerId); providers.configure({...providers.config(providerId),enabled:true}); return {ok:true}; });
  registrar.handle('secrets:session', ({providerId,key}) => { secrets.useInSession(providerId,key); providers.configure({...providers.config(providerId),enabled:true}); return {ok:true}; });
  updateApplicationMenu(store.settings.get().language);
  registrar.handle("settings:appearance", () => ({reducedTransparency:nativeTheme.prefersReducedTransparency}));
  registrar.handle("settings:systemLocale", () => process.env.VSTUDY_LOCALE ?? app.getLocale());
  registrar.handle("settings:get", () => store.settings.get());
  registrar.handle("settings:set", (settings) => { const saved = store.settings.set({...settings,autoCheckUpdates:store.settings.get().autoCheckUpdates}); updateApplicationMenu(saved.language); applyNativeTheme(saved); return saved; });
  registrar.handle("secrets:set", async ({ providerId, key }) => {
    await secrets.set(providerId, key);
    providers.configure({ ...providers.config(providerId), enabled: true });
    return { ok: true };
  });
  registrar.handle("secrets:has", ({ providerId }) => ({
    providerId,
    hasKey: secrets.has(providerId),
  }));
  registrar.handle("secrets:delete", ({ providerId }) => {
    secrets.delete(providerId);
    return { ok: true };
  });
  registerReviewIpc(registrar, store, implemented);
  const admission = getReviewAdmission(store);
  installReviewAdmission(admission);
  reviewWorkers.register(admission);
  startMemory(store, providers);
  registerReviewGenerateIpc(registrar, store, implemented, providers);
  registerUsageIpc(registrar, store, implemented, () => providers.config('codex-cli').enabled);
  const chat = registerChatIpc(registrar, store, secrets, implemented, providers);
  const disposeAiCli = registerAiCliIpc(registrar, implemented, providers, pins, chat);
  const disposeDocuments = registerDocumentsIpc(registrar, store, implemented, (id, remove) => chat.deleteDocument(id, remove), providers);
  const disposePlanner = registerPlannerIpc(registrar, store, implemented);
  const disposeMoodle = registerMoodleIpc(registrar, store, secrets, implemented, disposeDocuments, restoreMainWindow, options.moodleRequest);
  const userData=app.getPath('userData');
  const navigation=createAgentNavigation(disposeMoodle.service.repository,restoreMainWindow);
  let backend:ReturnType<typeof createMcpBackend>|undefined;
  const mcpBackend=()=>backend ??= createMcpBackend({store,moodle:disposeMoodle.service,documents:disposeDocuments,openModule:navigation.openModule,exportCalendar:async selection=>{
    const context=new PlannerRepository(store.db).context();
    const text=plannerCalendar(context.snapshot,context.deadlines,selection);
    const owner = await restoreMainWindow();
    if (!owner || owner.isDestroyed()) throw new Error('Main window unavailable');
    const result=await dialog.showSaveDialog(owner, {defaultPath:'vstudy-study-plan.ics',filters:[{name:tr('planner:calendar_file'),extensions:['ics']}]});
    if (result.canceled || !result.filePath) return {saved:false};
    await exportText(text,result.filePath);return {saved:true};
  }});
  const mcpPaths=options.mcpPaths ?? {
    peerHelper:app.isPackaged ? join(process.resourcesPath,'mcp-peer') : join(app.getAppPath(),'resources/mcp-peer'),
    serverBin:app.isPackaged ? join(process.resourcesPath,'mcp/dist/vstudy-mcp.cjs') : join(app.getAppPath(),'../mcp/dist/vstudy-mcp.cjs'),
  };
  const mcp=createMcpRuntime({userData,backend:mcpBackend,secretValues:()=>mcpBackend().secretValues(),
    ...(mcpPaths.peerHelper ? {peerHelper:mcpPaths.peerHelper} : {}),...(options.mcpTransport?{transport:options.mcpTransport}:{}),
    persistence:()=>typeof options.mcpPersistence==='function' ? options.mcpPersistence() : options.mcpPersistence,
    restoreWindow:restoreMainWindow,onFailure:()=>log({phase:'mcp-bridge-unavailable',code:'UNAVAILABLE'}),
  });
  const restoreMcp=()=>{void mcp.restore();};
  app.once('browser-window-created',restoreMcp);
  registerMcpIpc(registrar,implemented,mcp,navigation,createAgentClientSetup(mcpPaths.serverBin,userData));
  const disposeLibrary = registerLibraryIpc(registrar, store, implemented, async (id, remove) => {await disposeDocuments.stopAi(id);return chat.deleteDocument(id, remove);}, disposeDocuments.resume);
  registerStorageIpc(registrar,store,implemented,async()=>{await disposeMoodle.waitForIdle();await chat.waitForIdle();await disposeDocuments.waitForIdle();await disposeLibrary.waitForIdle();});
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    if (!implemented.has(channel))
      registrar.handle(channel, () => {
        throw new Error("not implemented");
      });
  }
  return async () => { stopUpdates?.(); updates?.dispose(); await webChats.dispose(); await reviewWorkers.dispose(); app.removeListener('browser-window-created',restoreMcp); registrar.dispose(); await mcp.dispose(); navigation.clear(); await disposeAiCli(); disposePlanner(); await disposeMoodle(); disposeLibrary(); await disposeLibrary.waitForIdle(); await chat.dispose(); await disposeDiscovery(); await disposeSearchWorkers(); await disposeDocuments(); };
}
