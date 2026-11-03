import { app, BrowserWindow, session, safeStorage, protocol } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { openStore, type Store } from "./db";
import { registerIpc } from "./ipc";
import { createSecretStore } from "./services/secrets";
import { developmentCsp, isAppUrl, productionCsp } from "./security";

import { assetHandler } from "./assets";

protocol.registerSchemesAsPrivileged([{ scheme: "vstudy-asset", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

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
