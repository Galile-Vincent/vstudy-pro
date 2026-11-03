import { disposeSearchWorkers } from '../services/search-runner';
import { disposeDiscovery } from '../providers/models';
import { networkActivity, recordEgress } from '../services/egress';
import { ExecutablePins, setExecutablePins } from '../providers/executable-pins';
import { tr, updateApplicationMenu } from "../i18n";
import { registerLibraryIpc } from "./library";
import { registerUsageIpc } from "./usage";
import { createProviderRegistry } from "../providers";
import { app, dialog, nativeTheme, shell, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { Store } from "../db";
import type { SecretStore } from "../services/secrets";
import { ipcContract, type IpcChannel } from "../../shared/ipc";
import { createIpcRegistrar } from "./register";
import { registerDocumentsIpc } from "./documents";
import { registerChatIpc } from "./chat";

export function registerIpc(
  store: Store,
  secrets: SecretStore,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
): () => Promise<void> {
  const pins = new ExecutablePins(`${app.getPath('userData')}/executable-pins.json`, async (previous, current) => {
    const result = await dialog.showMessageBox({type:'warning', message:tr('settings:binary_changed'), detail:tr('settings:binary_detail',{previous:previous.path,current:current.path,hash:current.hash,mtime:new Date(current.mtime).toISOString()}), buttons:[tr('common:cancel'),tr('settings:allow')],defaultId:0,cancelId:0});
    return result.response === 1;
  });
  setExecutablePins(pins);
  const providers = createProviderRegistry(secrets, `${app.getPath("userData")}/providers.json`);
  const registrar = createIpcRegistrar(ipcMain, isTrusted);
  const implemented = new Set<IpcChannel>([
    "shell:openExternal",
    "settings:appearance",
    "settings:systemLocale",
    "settings:get",
    "settings:set",
    "secrets:set",
    "secrets:has",
    "secrets:delete",
  ]);
  registrar.handle("shell:openExternal", async ({ url }) => {
    const target = new URL(url);
    const result = await dialog.showMessageBox({ type: 'question', message: tr("settings:external",{target:target.hostname || target.protocol}), detail: target.protocol === 'mailto:' ? tr('settings:mail_detail',{address:decodeURIComponent(target.pathname),subject:target.searchParams.get('subject') ?? '',length:(target.searchParams.get('body') ?? '').length,url}) : url, buttons: [tr('common:cancel'), tr('common:open')], defaultId: 0, cancelId: 0 });
    if (result.response === 1) { recordEgress('external_open', target.protocol === 'mailto:' ? 'Default mail application' : target.origin); await shell.openExternal(url); }
    return { ok: true };
  });
  implemented.add('providers:chooseExecutable');
  registrar.handle('providers:chooseExecutable', async ({binary}) => {
    const result = await dialog.showOpenDialog({title:tr('settings:choose_binary',{binary}),properties:['openFile']});
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
  registrar.handle("settings:set", (settings) => { const saved = store.settings.set(settings); updateApplicationMenu(saved.language); return saved; });
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
  registerUsageIpc(registrar, store, implemented, () => providers.config('codex-cli').enabled);
  const chat = registerChatIpc(registrar, store, secrets, implemented, providers);
  const disposeLibrary = registerLibraryIpc(registrar, store, implemented, (id, remove) => chat.deleteDocument(id, remove));
  const disposeDocuments = registerDocumentsIpc(registrar, store, implemented, (id, remove) => chat.deleteDocument(id, remove));
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    if (!implemented.has(channel))
      registrar.handle(channel, () => {
        throw new Error("not implemented");
      });
  }
  return async () => { registrar.dispose(); disposeLibrary(); await chat.dispose(); await disposeDiscovery(); await disposeSearchWorkers(); await disposeDocuments(); };
}
