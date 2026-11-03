import { shell, ipcMain, type IpcMainInvokeEvent } from "electron";
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
): () => void {
  const registrar = createIpcRegistrar(ipcMain, isTrusted);
  const implemented = new Set<IpcChannel>([
    "shell:openExternal",
    "settings:get",
    "settings:set",
    "secrets:set",
    "secrets:has",
    "secrets:delete",
  ]);
  registrar.handle("shell:openExternal", async ({ url }) => {
    await shell.openExternal(url);
    return { ok: true };
  });
  registrar.handle("settings:get", () => store.settings.get());
  registrar.handle("settings:set", (settings) => store.settings.set(settings));
  registrar.handle("secrets:set", ({ providerId, key }) => {
    secrets.set(providerId, key);
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
  registerDocumentsIpc(registrar, store, implemented);
  registerChatIpc(registrar, store, secrets, implemented);
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    if (!implemented.has(channel))
      registrar.handle(channel, () => {
        throw new Error("not implemented");
      });
  }
  return () => registrar.dispose();
}
