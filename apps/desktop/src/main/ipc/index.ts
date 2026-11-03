import { updateApplicationMenu } from "../i18n";
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
    const result = await dialog.showMessageBox({ type: 'question', message: `Open external link to ${target.hostname || target.protocol}?`, detail: url, buttons: ['Cancel', 'Open'], defaultId: 0, cancelId: 0 });
    if (result.response === 1) await shell.openExternal(url);
    return { ok: true };
  });
  updateApplicationMenu(store.settings.get().language);
  registrar.handle("settings:appearance", () => ({reducedTransparency:nativeTheme.prefersReducedTransparency}));
  registrar.handle("settings:systemLocale", () => process.env.VSTUDY_LOCALE ?? app.getLocale());
  registrar.handle("settings:get", () => store.settings.get());
  registrar.handle("settings:set", (settings) => { const saved = store.settings.set(settings); updateApplicationMenu(saved.language); return saved; });
  registrar.handle("secrets:set", ({ providerId, key }) => {
    secrets.set(providerId, key);
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
  registerUsageIpc(registrar, store, implemented);
  const chat = registerChatIpc(registrar, store, secrets, implemented, providers);
  const disposeLibrary = registerLibraryIpc(registrar, store, implemented, (id, remove) => chat.deleteDocument(id, remove));
  const disposeDocuments = registerDocumentsIpc(registrar, store, implemented, (id, remove) => chat.deleteDocument(id, remove));
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    if (!implemented.has(channel))
      registrar.handle(channel, () => {
        throw new Error("not implemented");
      });
  }
  return async () => { disposeLibrary(); registrar.dispose(); await disposeDocuments(); };
}
