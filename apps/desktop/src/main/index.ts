import { attachNavigationInput } from './navigation-input';
import { initializeAnalytics } from './analytics/runtime';
import { analytics } from './analytics/service';
const analyticsStartup = performance.now();
let telemetry: ReturnType<typeof initializeAnalytics>;
/**
 * Own Electron startup, application protocols, main-window creation, and ordered shutdown.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { reconcileDownloads } from "./storage/reconcile";
import { confirmRestoreStartup, rollbackRestoreStartup } from "./storage/restore-startup";
import { recoverRestore } from "./storage/backup";
import { applyNativeTheme, nativeBackground } from './theme';
import { initializeMoodleProtocol } from './moodle/sso-protocol';
import { log, copyDiagnostics } from './logging';
import { showAttachedMessage, showStartupError, type StartupStage } from './dialogs';
import { readWindowState, trackWindowState } from './window-state';
import { coordinateShutdown } from './shutdown';
import { acquireOwnership } from './ownership';
import { tr } from './i18n';
import { realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runPackagedSmoke } from './packaged-smoke';
import { app, BrowserWindow, nativeTheme, session, safeStorage, protocol, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { openStore, type Store } from "./db";
import { createUpdates } from './updates/runtime';
import { registerIpc } from "./ipc";
import { createWindowsStatePersistence } from "./mcp/windows-state";
import { createSecretStore } from "./services/secrets";
import { developmentCsp, isAppUrl, productionCsp } from "./security";

import { deleteAllData } from "./services/delete-data";
import { createIpcRegistrar } from "./ipc/register";
import { assetHandler } from "./assets";
import { isPathWithin } from './platform/paths';
import { relative } from 'node:path';
import { prepareDistributionSmoke, runDistributionSmoke } from './distribution-smoke';

let startupStage: StartupStage = 'services';
let startupComplete = false;
let startupFailed = false;
let resolveAppReady!: (ready: boolean) => void;
const appReady = new Promise<boolean>(resolve => { resolveAppReady = resolve; });
class RendererRecoveryExhausted extends Error {
  constructor(readonly dialogClosed: Promise<void>) { super('Renderer recovery exhausted'); }
}
function failStartup(error: unknown, reported = false): void {
  if (startupFailed) return;
  startupFailed = true;
  resolveAppReady(false);
  log({phase:'startup-failed', stage:startupStage, error: error instanceof Error ? error.stack ?? error.message : error});
  if (!reported) showStartupError(error, startupStage);
}
function requestMainWindow(): void {
  void restoreMainWindow().catch(error => log({phase:'window-restore-failed', error}));
}
let distributionSmokeRoot: ReturnType<typeof prepareDistributionSmoke>;
const smokeRoot = process.env.VSTUDY_PACKAGED_SMOKE_DIR;
try {
  distributionSmokeRoot = prepareDistributionSmoke();
  initializeMoodleProtocol();

  protocol.registerSchemesAsPrivileged(['vstudy-asset', 'vstudy'].map(scheme => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } })));

  if (smokeRoot) {
    const canonical = realpathSync(smokeRoot), temporary = realpathSync(tmpdir());
    if (!isPathWithin(temporary, canonical) || !/^vstudy-packaged-smoke-[^/\\]+$/.test(relative(temporary, canonical)) || process.env.VSTUDY_FAKE_PROVIDER !== '1') throw new Error('Invalid isolated smoke directory');
    const isolated = join(canonical, 'user-data');
    mkdirSync(isolated, {recursive:true,mode:0o700});
    if (lstatSync(isolated).isSymbolicLink() || realpathSync(isolated) !== isolated) throw new Error('Smoke user data must be an isolated directory');
    app.setPath('userData', isolated);
  }
} catch (error) { failStartup(error); app.exit(1); }
process.on('exit', code => log({phase:'main-exit',code}));
app.on('child-process-gone', (_event,details) => {if (details.reason !== 'clean-exit') analytics()?.track('app_crashed',{crash_category:'child_process'});log({phase:'main-child-process-gone',code:details.exitCode,reason:details.reason,type:details.type});});
app.on('render-process-gone', (_event,_contents,details) => {if (details.reason !== 'clean-exit') analytics()?.track('app_crashed',{crash_category:'renderer'});log({phase:'main-render-process-gone',code:details.exitCode,reason:details.reason});});
process.on('uncaughtExceptionMonitor', error => {
  analytics()?.track('app_error',{error_category:'other',feature:'app'});
  log({phase:'main-uncaught-exception',code:(error as NodeJS.ErrnoException).code ?? error.name});
  if (!startupComplete) { failStartup(error); app.exit(1); }
});
process.on('unhandledRejection', error => {
  log({phase:'main-unhandled-rejection', error: error instanceof Error ? error.stack ?? error.message : error});
  if (!startupComplete) { failStartup(error); app.exit(1); }
});
process.umask(0o077);
app.enableSandbox();
if (app.isPackaged) {
  for (const name of ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk']) app.commandLine.removeSwitch(name);
}
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
  (app.isPackaged ? "vstudy://app/index.html" : pathToFileURL(join(__dirname, "../renderer/index.html")).href);

let reloads: number[] = [];
let openingWindow: Promise<void> | undefined;
async function restoreMainWindow(): Promise<BrowserWindow | undefined> {
  if (!await appReady) return;
  if (window && !window.isDestroyed()) {window.show();window.focus();return window;}
  await (openingWindow ??= createWindow().finally(() => {openingWindow=undefined;}));
  return window ?? undefined;
}

async function createWindow(show = true): Promise<void> {
  const appearance = store!.settings.get();
  applyNativeTheme(appearance);
  if (!app.isPackaged && process.platform === "darwin") app.dock?.setIcon(join(__dirname, "../../build/icon-mac.png"));
  const state = readWindowState(app.getPath('userData'));
  const { x, y, width, height } = state;
  const current = new BrowserWindow({
    ...(x === undefined ? {} : {x}), ...(y === undefined ? {} : {y}), width, height,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: nativeBackground(appearance),
    title: "VStudy Pro",
    titleBarStyle: 'default',
    titleBarOverlay: false,
    autoHideMenuBar: process.platform === 'win32',
    icon: app.isPackaged ? join(process.resourcesPath, "brand/icon.png") : join(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
  window = current;
  trackWindowState(current, app.getPath('userData'), state);
  attachNavigationInput(current);
  current.on('focus',()=>telemetry?.activity.focus(true));
  current.on('blur',()=>telemetry?.activity.focus(false));
  current.on('minimize',()=>{telemetry?.activity.focus(false);analytics()?.track('app_minimized');});
  applyNativeTheme(appearance);
  current.webContents.on('will-frame-navigate', event => { if (!event.isMainFrame) event.preventDefault(); });
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
  let shown = false;
  const showWindow = () => {
    if (show && !shown && !current.isDestroyed()) { shown = true; current.show(); }
  };
  const showTimeout = setTimeout(showWindow, 10_000);
  showTimeout.unref();
  current.once('ready-to-show', () => { clearTimeout(showTimeout); showWindow(); });
  let settleNavigation: (dialogClosed: Promise<void>) => boolean = () => false;
  let recoveryDialogOpen = false;
  const recoverRenderer = () => {
    if (current.isDestroyed()) return;
    const now = Date.now();
    reloads = reloads.filter(time => now - time < 60_000);
    if (reloads.length < 2) {
      reloads.push(now);
      current.webContents.reload();
      return;
    }
    if (recoveryDialogOpen) return;
    recoveryDialogOpen = true;
    const dialogClosed = dialog.showMessageBox(current, {
      type: 'error', message: tr('errors:window_unavailable'),
      buttons: [tr('common:menu_quit'), tr('common:copy_diagnostics')], defaultId: 0, cancelId: 1,
    }).then(({ response }) => { if (response === 0) { if (!failedNavigation) app.quit(); } else copyDiagnostics(); })
      .catch(error => log({phase:'window-recovery-dialog-failed', error}))
      .finally(() => { recoveryDialogOpen = false; });
    const failedNavigation = settleNavigation(dialogClosed);
  };
  let unresponsiveTimeout: ReturnType<typeof setTimeout> | undefined;
  const cancelUnresponsive = () => { clearTimeout(unresponsiveTimeout); unresponsiveTimeout = undefined; };
  current.webContents.on('render-process-gone', (_event, details) => {
    cancelUnresponsive();
    log({phase:'main-window-render-process-gone', reason:details.reason, code:details.exitCode});
    if (!quitting && details.reason !== 'clean-exit') recoverRenderer();
  });
  current.on('unresponsive', () => {
    log({phase:'main-window-unresponsive'});
    if (unresponsiveTimeout) return;
    unresponsiveTimeout = setTimeout(() => {
      unresponsiveTimeout = undefined;
      if (!quitting) recoverRenderer();
    }, 10_000);
    unresponsiveTimeout.unref();
  });
  current.on('responsive', cancelUnresponsive);
  current.on("closed", () => {
    cancelUnresponsive();
    clearTimeout(showTimeout);
    if (window === current) window = null;
  });
  if (smokeRoot) current.webContents.once('did-finish-load', () => { void runPackagedSmoke(current, realpathSync(smokeRoot)); });
  await new Promise<void>((resolve, reject) => {
    const settle = (error?: unknown) => {
      settleNavigation = () => false;
      current.removeListener('closed', closed);
      current.webContents.removeListener('destroyed', closed);
      current.webContents.removeListener('did-finish-load', loaded);
      current.webContents.removeListener('did-fail-load', failed);
      if (error) reject(error);
      else resolve();
    };
    settleNavigation = dialogClosed => { settle(new RendererRecoveryExhausted(dialogClosed)); return true; };
    const loaded = () => settle();
    const closed = () => settle();
    const failed = (_event: Electron.Event, code: number, description: string, _url: string, mainFrame: boolean) => {
      if (mainFrame && code !== -3) settle(new Error(description));
    };
    current.once('closed', closed);
    current.webContents.once('destroyed', closed);
    current.webContents.once('did-finish-load', loaded);
    current.webContents.on('did-fail-load', failed);
    // A reload cancels the initial navigation; wait for its replacement or window closure.
    void current.loadURL(entryUrl).catch(error => { if (error.code !== 'ERR_ABORTED') settle(error); });
  });
}

const ownsApplication = !startupFailed && acquireOwnership(app, () => window, requestMainWindow);
if (ownsApplication) void app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.vstudy.pro');
  startupStage = 'recovery';
  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  await rollbackRestoreStartup(userData);
  await recoverRestore(userData);
  await reconcileDownloads(join(userData,"moodle-downloads"));
  startupStage = 'database';
  store = openStore(join(userData, "vstudy.sqlite"));
  telemetry = initializeAnalytics(store.db,store.settings.get().language);
  startupStage = 'services';
  protocol.handle("vstudy-asset", assetHandler(store, userData));
  protocol.handle('vstudy', async request => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.hostname !== 'app' || url.port || url.username || url.password || url.search || !/^\/(?:index\.html|assets\/[a-zA-Z0-9_.-]+)$/.test(url.pathname)) return new Response(null, { status: 404 });
    const types: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', webm: 'video/webm', vtt: 'text/vtt' };
    const type = types[url.pathname.split('.').at(-1)!];
    if (!type) return new Response(null, { status: 415 });
    try {
      const body = await readFile(join(__dirname, '../renderer', url.pathname.slice(1)));
      if (body.length > 16 * 1024 * 1024) return new Response(null, { status: 413 });
      return new Response(body, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': productionCsp } });
    } catch { return new Response(null, { status: 404 }); }
  });
  const secrets = createSecretStore(
    join(userData, "secrets.json"),
    safeStorage,
  );
  session.defaultSession.setDevicePermissionHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = ['file:', 'vstudy:', 'vstudy-asset:', 'data:', 'devtools:'].includes(url.protocol);
    const dev = developmentUrl && ['http:', 'ws:'].includes(url.protocol) && url.host === new URL(developmentUrl).host;
    callback({ cancel: !local && !dev });
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => callback(permission === "clipboard-sanitized-write" && details.isMainFrame && isAppUrl(details.requestingUrl, entryUrl) && isAppUrl(webContents.getURL(), entryUrl)),
  );
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => permission === "clipboard-sanitized-write" && !!webContents && details.isMainFrame && isAppUrl(webContents.getURL(), entryUrl));
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
  let updaterWindowShown = () => {};
  const updaterReady = new Promise<void>(resolve => { updaterWindowShown = resolve; });
  disposeIpc = registerIpc(
    store,
    secrets,
    (event) =>
      !!window &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppUrl(event.senderFrame.url, entryUrl),
    restoreMainWindow,
    { updates: createUpdates(store, updaterReady), ...(process.platform === "win32" ? {mcpPersistence: createWindowsStatePersistence()} : {}) },
  );
  const deletion = createIpcRegistrar(ipcMain, event => !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isAppUrl(event.senderFrame.url, entryUrl));
  ipcMain.removeHandler('settings:deleteAllData');
  deletion.handle('settings:deleteAllData', async (_request, event) => {
    const result = await showAttachedMessage({ type: 'warning', message: tr('settings:delete_title'), detail: tr('settings:delete_copy'), buttons: [tr('common:cancel'), tr('settings:delete')], defaultId: 0, cancelId: 0 }, event.sender);
    if (result.response !== 1) return { ok: true };
    await deleteAllData(userData, async () => {
      window?.destroy();
      await session.defaultSession.clearStorageData();
      await session.defaultSession.clearCache();
      await session.defaultSession.closeAllConnections();
      session.defaultSession.flushStorageData();
      await disposeIpc?.();
      await telemetry?.stop();
      store?.close();
      store = undefined;
    });
    app.exit();
    return { ok: true };
  });
  nativeTheme.on("updated", () => { if (store) applyNativeTheme(store.settings.get()); });
  app.on("activate", () => {
    requestMainWindow();
  });
  startupStage = 'window';
  await createWindow(!process.argv.includes('--mcp-background'));
  updaterWindowShown();
  analytics()?.track('app_performance_sample',{startup_ms:Math.round(performance.now()-analyticsStartup)});
  if (distributionSmokeRoot) { await runDistributionSmoke(window!, store!, distributionSmokeRoot); return; }
  await confirmRestoreStartup(userData);
  startupComplete = true;
  resolveAppReady(true);
}).catch(async error => {
  if (error instanceof RendererRecoveryExhausted) await error.dialogClosed;
  failStartup(error, error instanceof RendererRecoveryExhausted);
  try {
    await disposeIpc?.();
    store?.close(); store = undefined;
    if (await rollbackRestoreStartup(app.getPath('userData'))) app.relaunch();
  } catch (cleanupError) { log({phase:'startup-cleanup-failed', error:cleanupError}); }
  finally { app.exit(1); }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let quitting = false;
const shutdown = coordinateShutdown({
  stopWork: async () => { await disposeIpc?.(); await telemetry?.stop(); },
  flush: () => { if (app.isReady()) session.defaultSession.flushStorageData(); },
  close: () => { store?.close(); store = undefined; },
  quit: () => { quitting = true; app.quit(); },
  forceExit: () => app.exit(),
});
app.on("before-quit", (event) => {
  if (quitting || !ownsApplication) return;
  event.preventDefault();
  void shutdown();
});
