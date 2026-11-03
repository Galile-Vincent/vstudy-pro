import { app, BrowserWindow, session, safeStorage, protocol, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { openStore, type Store } from "./db";
import { registerIpc } from "./ipc";
import { createSecretStore } from "./services/secrets";
import { developmentCsp, isAppUrl, productionCsp } from "./security";

import { deleteAllData } from "./services/delete-data";
import { createIpcRegistrar } from "./ipc/register";
import { assetHandler } from "./assets";

protocol.registerSchemesAsPrivileged([{ scheme: "vstudy-asset", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.enableSandbox();
if (app.isPackaged) {
  for (const name of ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk']) app.commandLine.removeSwitch(name);
}
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
});
let store: Store | undefined;
let disposeIpc: (() => Promise<void>) | undefined;
let window: BrowserWindow | null = null;
const developmentUrl = !app.isPackaged
  ? process.env.ELECTRON_RENDERER_URL
  : undefined;
const entryUrl =
  developmentUrl ??
  pathToFileURL(join(__dirname, "../renderer/index.html")).href;

function createWindow(): void {
  const current = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: "VStudy Pro",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  window = current;
  current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  current.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url, entryUrl)) event.preventDefault();
  });
  current.webContents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url, entryUrl)) event.preventDefault();
  });
  current.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  current.once("ready-to-show", () => current.show());
  current.on("closed", () => {
    if (window === current) window = null;
  });
  void current.loadURL(entryUrl);
}

void app.whenReady().then(() => {
  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  store = openStore(join(userData, "vstudy.sqlite"));
  protocol.handle("vstudy-asset", assetHandler(store, userData));
  const secrets = createSecretStore(
    join(userData, "secrets.json"),
    safeStorage,
  );
  session.defaultSession.setDevicePermissionHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = ['file:', 'vstudy-asset:', 'data:', 'devtools:'].includes(url.protocol);
    const dev = developmentUrl && ['http:', 'ws:'].includes(url.protocol) && url.host === new URL(developmentUrl).host;
    callback({ cancel: !local && !dev });
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => callback(permission === "clipboard-sanitized-write" && isAppUrl(webContents.getURL(), entryUrl)),
  );
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => permission === "clipboard-sanitized-write" && !!webContents && isAppUrl(webContents.getURL(), entryUrl));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          developmentUrl ? developmentCsp(entryUrl) : productionCsp,
        ],
      },
    }),
  );
  disposeIpc = registerIpc(
    store,
    secrets,
    (event) =>
      !!window &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppUrl(event.senderFrame.url, entryUrl),
  );
  const deletion = createIpcRegistrar(ipcMain, event => !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isAppUrl(event.senderFrame.url, entryUrl));
  ipcMain.removeHandler('settings:deleteAllData');
  deletion.handle('settings:deleteAllData', async () => {
    const result = await dialog.showMessageBox({ type: 'warning', message: 'Delete all VStudy data?', detail: 'Documents, conversations, keys, caches and the converter environment will be permanently removed. The app will quit.', buttons: ['Cancel', 'Delete all data'], defaultId: 0, cancelId: 0 });
    if (result.response !== 1) return { ok: true };
    await deleteAllData(userData, async () => {
      window?.destroy();
      await disposeIpc?.();
      store?.close();
      store = undefined;
    });
    app.exit();
    return { ok: true };
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const timeout = setTimeout(() => app.exit(), 5000);
  void Promise.resolve(disposeIpc?.()).catch(() => undefined).finally(() => {
    clearTimeout(timeout);
    store?.close();
    app.quit();
  });
});
