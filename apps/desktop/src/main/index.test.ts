/** Exercise actual startup and createWindow with controlled Electron navigation and close events. */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(), rollback: vi.fn(async () => false), dispose: vi.fn(), closeStore: vi.fn(),
  showMessage: vi.fn(), log: vi.fn(),
}));
const electron = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    static instances: Window[] = [];
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), isDestroyed: () => this.destroyed });
    loadURL = vi.fn(() => Promise.reject(Object.assign(new Error('reload interrupted navigation'), { code: 'ERR_ABORTED' })));
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = () => this.destroyed;
    constructor() { super(); Window.instances.push(this); }
    close() { this.destroyed = true; this.webContents.emit('destroyed'); this.emit('closed'); }
    static getAllWindows() { return Window.instances.filter(w => !w.destroyed); }
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false, whenReady: () => Promise.resolve(), getPath: () => '/tmp/vstudy-startup-unit-test',
    enableSandbox: vi.fn(), exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(),
  });
  return {
    app, BrowserWindow: Window, nativeTheme: new EventEmitter(), safeStorage: {}, ipcMain: { removeHandler: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    session: { defaultSession: {
      setDevicePermissionHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn() },
    } },
  };
});
vi.mock('electron', () => electron);
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));
vi.mock('./db', () => ({ openStore: () => ({ settings: { get: () => ({}) }, close: mocks.closeStore }) }));
vi.mock('./ipc', () => ({ registerIpc: () => mocks.dispose }));
vi.mock('./ipc/register', () => ({ createIpcRegistrar: () => ({ handle: vi.fn() }) }));
vi.mock('./services/secrets', () => ({ createSecretStore: vi.fn() }));
vi.mock('./services/delete-data', () => ({ deleteAllData: vi.fn() }));
vi.mock('./assets', () => ({ assetHandler: vi.fn() }));
vi.mock('./theme', () => ({ applyNativeTheme: vi.fn(), nativeBackground: () => '#ffffff' }));
vi.mock('./moodle/sso-protocol', () => ({ initializeMoodleProtocol: vi.fn() }));
vi.mock('./storage/reconcile', () => ({ reconcileDownloads: vi.fn() }));
vi.mock('./storage/restore-startup', () => ({ confirmRestoreStartup: mocks.confirm, rollbackRestoreStartup: mocks.rollback }));
vi.mock('./storage/backup', () => ({ recoverRestore: vi.fn() }));
vi.mock('./logging', () => ({ log: mocks.log }));
vi.mock('./dialogs', () => ({ showAttachedMessage: mocks.showMessage }));
vi.mock('./shutdown', () => ({ coordinateShutdown: () => vi.fn() }));
vi.mock('./ownership', () => ({ acquireOwnership: () => true }));
vi.mock('./i18n', () => ({ tr: (key: string) => key }));
vi.mock('./packaged-smoke', () => ({ runPackagedSmoke: vi.fn() }));

const eventProcess: EventEmitter = process;
let processListeners: Map<string, ReturnType<EventEmitter['rawListeners']>>;
beforeEach(() => {
  processListeners = new Map(['exit', 'uncaughtExceptionMonitor', 'unhandledRejection'].map(event => [event, eventProcess.rawListeners(event)]));
  vi.resetModules();
  vi.clearAllMocks();
  electron.app.removeAllListeners();
  electron.nativeTheme.removeAllListeners();
  electron.BrowserWindow.instances = [];
});
afterEach(() => {
  for (const [event, before] of processListeners) {
    for (const listener of eventProcess.rawListeners(event)) {
      if (!before.includes(listener)) eventProcess.removeListener(event, listener as (...args: unknown[]) => void);
    }
  }
});
async function start() {
  await import('./index');
  await vi.waitFor(() => expect(electron.BrowserWindow.instances).toHaveLength(1));
  return electron.BrowserWindow.instances[0]!;
}
it.each(['closed', 'destroyed'])('completes startup after an aborted reload followed by %s', async event => {
  const window = await start();
  window.destroyed = true;
  if (event === 'closed') window.emit('closed');
  else window.webContents.emit('destroyed');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce(), { timeout: 500 });
  expect(electron.app.listenerCount('activate')).toBe(1);
  expect(mocks.closeStore).not.toHaveBeenCalled();
  expect(electron.app.exit).not.toHaveBeenCalled();
  expect(window.webContents.listenerCount('did-finish-load')).toBe(0);
  expect(window.webContents.listenerCount('did-fail-load')).toBe(0);
  expect(window.webContents.listenerCount('destroyed')).toBe(0);
  electron.app.emit('activate');
  expect(electron.BrowserWindow.instances).toHaveLength(2);
  electron.BrowserWindow.instances[1]!.webContents.emit('did-finish-load');
});
it('waits through a reload cancellation until its replacement navigation finishes', async () => {
  const window = await start();
  window.webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'file://app', true);
  expect(mocks.confirm).not.toHaveBeenCalled();
  window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  expect(window.webContents.listenerCount('did-fail-load')).toBe(0);
  expect(window.webContents.listenerCount('destroyed')).toBe(0);
});
it('rejects a real main-frame load failure and removes the pending navigation listeners', async () => {
  const window = await start();
  window.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'file://app', true);
  await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(1));
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.closeStore).toHaveBeenCalledOnce();
  expect(window.webContents.listenerCount('did-finish-load')).toBe(0);
  expect(window.webContents.listenerCount('did-fail-load')).toBe(0);
});
