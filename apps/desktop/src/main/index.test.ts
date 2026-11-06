/** Exercise actual startup and createWindow with controlled Electron navigation and close events. */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { McpRuntime } from './mcp/runtime';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(), rollback: vi.fn(async () => false), dispose: vi.fn(), closeStore: vi.fn(),
  showMessage: vi.fn(), fatal: vi.fn(), copyDiagnostics: vi.fn(), log: vi.fn(), registerIpc: vi.fn(),
}));
const electron = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    static instances: Window[] = [];
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), reload: vi.fn(), isDestroyed: () => this.destroyed });
    loadURL = vi.fn(() => Promise.reject(Object.assign(new Error('reload interrupted navigation'), { code: 'ERR_ABORTED' })));
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = () => this.destroyed;
    constructor() { super(); Window.instances.push(this); app.emit('browser-window-created', {}, this); }
    close() { this.destroyed = true; this.webContents.emit('destroyed'); this.emit('closed'); }
    static getAllWindows() { return Window.instances.filter(w => !w.destroyed); }
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false, whenReady: () => Promise.resolve(), getPath: () => '/tmp/vstudy-startup-unit-test',
    enableSandbox: vi.fn(), exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(), setAppUserModelId: vi.fn(),
  });
  return {
    app, dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) }, BrowserWindow: Window, nativeTheme: new EventEmitter(), safeStorage: {}, ipcMain: { removeHandler: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    session: { defaultSession: {
      setDevicePermissionHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn() },
    } },
  };
});
vi.mock('electron', () => electron);
vi.mock('node:fs', async importOriginal => ({...await importOriginal<typeof import('node:fs')>(), mkdirSync:vi.fn()}));
vi.mock('./db', () => ({ openStore: () => ({ settings: { get: () => ({}) }, close: mocks.closeStore }) }));
vi.mock('./ipc', () => ({ registerIpc: () => mocks.registerIpc() }));
vi.mock('./ipc/register', () => ({ createIpcRegistrar: () => ({ handle: vi.fn() }) }));
vi.mock('./services/secrets', () => ({ createSecretStore: vi.fn() }));
vi.mock('./services/delete-data', () => ({ deleteAllData: vi.fn() }));
vi.mock('./assets', () => ({ assetHandler: vi.fn() }));
vi.mock('./theme', () => ({ applyNativeTheme: vi.fn(), nativeBackground: () => '#ffffff' }));
vi.mock('./moodle/sso-protocol', () => ({ initializeMoodleProtocol: vi.fn() }));
vi.mock('./storage/reconcile', () => ({ reconcileDownloads: vi.fn() }));
vi.mock('./storage/restore-startup', () => ({ confirmRestoreStartup: mocks.confirm, rollbackRestoreStartup: mocks.rollback }));
vi.mock('./storage/backup', () => ({ recoverRestore: vi.fn() }));
vi.mock('./logging', () => ({ log: mocks.log, copyDiagnostics: mocks.copyDiagnostics }));
vi.mock('./dialogs', () => ({ showAttachedMessage: mocks.showMessage, showStartupError: mocks.fatal }));
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
  mocks.registerIpc.mockReturnValue(mocks.dispose);
  electron.app.removeAllListeners();
  electron.nativeTheme.removeAllListeners();
  electron.BrowserWindow.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
  for (const window of electron.BrowserWindow.instances) window.close();
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
  expect(mocks.fatal).toHaveBeenCalledWith(expect.any(Error), 'window');
  expect(mocks.closeStore).toHaveBeenCalledOnce();
  expect(window.webContents.listenerCount('did-finish-load')).toBe(0);
  expect(window.webContents.listenerCount('did-fail-load')).toBe(0);
});

it.each([
  ['persistence factory', false], ['persistence factory', true],
  ['Windows-shaped process', false], ['Windows-shaped process', true],
] as const)('creates the main window with %s failure and MCP enabled=%s', async (failure, enabled) => {
  const {createMcpRuntime} = await vi.importActual<typeof import('./mcp/runtime')>('./mcp/runtime');
  const descriptor = Object.getOwnPropertyDescriptor(process, 'getuid');
  const persistence = vi.fn(() => {throw Error('private startup path token=school-secret');});
  const onFailure = vi.fn(() => mocks.log({phase:'mcp-bridge-unavailable', code:'UNAVAILABLE'}));
  let runtime:McpRuntime | undefined;
  try {
    if (failure === 'Windows-shaped process') Object.defineProperty(process, 'getuid', {...descriptor, configurable:true, value:undefined});
    mocks.registerIpc.mockImplementation(() => {
      runtime = createMcpRuntime({userData:'/unused-startup-path', backend:{accounts:()=>[], prepare:async()=>{throw Error('unused');}},
        ...(failure === 'persistence factory' ? {persistence} : {}), secretValues:()=>[], restoreWindow:()=>{}, onFailure,
      });
      if (enabled) void runtime.setEnabled(true);
      return () => runtime!.dispose();
    });
    const window = await start();
    window.emit('ready-to-show');
    expect(window.show).toHaveBeenCalledOnce();
    window.webContents.emit('did-finish-load');
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(electron.app.exit).not.toHaveBeenCalled();
    expect(mocks.closeStore).not.toHaveBeenCalled();
    if (enabled) {
      await vi.waitFor(() => expect(runtime!.state()).toMatchObject({enabled:false, unavailable:true}));
      expect(onFailure).toHaveBeenCalledOnce();
      expect(mocks.log).toHaveBeenCalledWith({phase:'mcp-bridge-unavailable', code:'UNAVAILABLE'});
      if (failure === 'persistence factory') expect(persistence).toHaveBeenCalledOnce();
    } else {
      expect(runtime!.state()).toMatchObject({enabled:false, unavailable:false});
      expect(onFailure).not.toHaveBeenCalled();
      expect(persistence).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('school-secret');
  } finally {
    if (descriptor) Object.defineProperty(process, 'getuid', descriptor);
    else Reflect.deleteProperty(process, 'getuid');
    await runtime?.dispose();
  }
});


it.each(['enabled', 'throwing', 'absent', 'corrupt'] as const)('restores %s MCP state after creating a hidden background window', async persisted => {
  const {createMcpRuntime} = await vi.importActual<typeof import('./mcp/runtime')>('./mcp/runtime');
  const previousArgv = [...process.argv];
  const write = vi.fn();
  const read = vi.fn(() => {
    expect(electron.BrowserWindow.instances).toHaveLength(1);
    if (persisted === 'throwing') throw Error('private token=school-secret');
    return persisted === 'absent' ? undefined : persisted === 'corrupt' ? '{broken' : JSON.stringify({version:1, enabled:true, grants:[], activity:[]});
  });
  const transport = vi.fn(async () => ({endpoint:{kind:'unix' as const, path:'/fixture'}, dispose:async()=>{}}));
  const onFailure = vi.fn();
  let runtime:McpRuntime | undefined;
  let restoring:Promise<void> | undefined;
  try {
    process.argv.push('--mcp-background');
    mocks.registerIpc.mockImplementation(() => {
      runtime = createMcpRuntime({userData:'.', backend:{accounts:()=>[], prepare:async()=>{throw Error('unused');}},
        persistence:{read, write}, transport, secretValues:()=>[], restoreWindow:()=>{}, onFailure,
      });
      electron.app.once('browser-window-created', () => {restoring = runtime!.restore();});
      expect(read).not.toHaveBeenCalled();
      return () => runtime!.dispose();
    });
    const window = await start();
    window.emit('ready-to-show');
    expect(window.show).not.toHaveBeenCalled();
    window.webContents.emit('did-finish-load');
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    await restoring;
    expect(electron.app.exit).not.toHaveBeenCalled();
    expect(mocks.closeStore).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledOnce();
    expect(runtime!.state()).toMatchObject({enabled:persisted === 'enabled', unavailable:['throwing','corrupt'].includes(persisted)});
    expect(transport).toHaveBeenCalledTimes(persisted === 'enabled' ? 1 : 0);
    expect(write).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(['throwing','corrupt'].includes(persisted) ? 1 : 0);
  } finally {
    process.argv.splice(0, process.argv.length, ...previousArgv);
    await runtime?.dispose();
  }
});

it.each(['render-process-gone', 'unresponsive'])('bounds automatic reloads for main-window %s and offers diagnostics', async event => {
  const window = await start();
  window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  const emit = () => event === 'unresponsive' ? window.emit(event) : window.webContents.emit(event, {}, {reason:'crashed', exitCode:1});
  emit(); emit(); emit(); emit();
  expect(window.webContents.reload).toHaveBeenCalledTimes(2);
  expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
  expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({buttons:['common:menu_quit','common:copy_diagnostics']}));
  await vi.waitFor(() => expect(mocks.copyDiagnostics).toHaveBeenCalledOnce());
  expect(electron.app.exit).not.toHaveBeenCalled();
});
it('allows recovery again after the 60-second reload budget expires', async () => {
  vi.useFakeTimers();
  const window = await start();
  for (let i=0; i<2; i++) window.emit('unresponsive');
  await vi.advanceTimersByTimeAsync(60_001);
  window.emit('unresponsive');
  expect(window.webContents.reload).toHaveBeenCalledTimes(3);
  expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
});
it.each([false,true])('shows the ready timeout fallback only for foreground launches (background=%s)', async background => {
  vi.useFakeTimers();
  if (background) process.argv.push('--mcp-background');
  try {
    const window = await start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(window.show).toHaveBeenCalledTimes(background ? 0 : 1);
    window.emit('ready-to-show');
    expect(window.show).toHaveBeenCalledTimes(background ? 0 : 1);
  } finally { if (background) process.argv.pop(); }
});
it('quits through ordered shutdown when recovery is exhausted and Quit is selected', async () => {
  electron.dialog.showMessageBox.mockResolvedValueOnce({response:0});
  const window = await start();
  window.emit('unresponsive'); window.emit('unresponsive'); window.emit('unresponsive');
  await vi.waitFor(() => expect(electron.app.quit).toHaveBeenCalledOnce());
});
it('settles initial navigation when renderer recovery is exhausted', async () => {
  const window = await start();
  for (let i=0;i<3;i++) window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
});
