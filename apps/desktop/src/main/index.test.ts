/** Exercise actual startup and createWindow with controlled Electron navigation and close events. */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { McpRuntime } from './mcp/runtime';

const mocks = vi.hoisted(() => ({
  installing:false, shutdownWork:undefined as undefined | (() => Promise<void>),
  handlers:new Map<string,(...args:unknown[]) => Promise<unknown>>(), initialize:vi.fn(), confirm: vi.fn(), rollback: vi.fn(async () => false), dispose: vi.fn(), closeStore: vi.fn(),
  showMessage: vi.fn(), fatal: vi.fn(), copyDiagnostics: vi.fn(), logDeletionFailure:vi.fn(), log: vi.fn(), registerIpc: vi.fn(), restore: undefined as undefined | (() => void),
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
    releaseSingleInstanceLock:vi.fn(), enableSandbox: vi.fn(), exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(), setAppUserModelId: vi.fn(),
  });
  return {
    app, dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) }, BrowserWindow: Window, nativeTheme: new EventEmitter(), safeStorage: {}, ipcMain: Object.assign(new EventEmitter(), { removeHandler: vi.fn() }),
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    session: { fromPath:vi.fn(() => {throw Error("duplicate context");}), defaultSession: {
      clearStorageData:vi.fn(), clearCache:vi.fn(), clearAuthCache:vi.fn(),
      closeAllConnections:vi.fn(), flushStorageData:vi.fn(), cookies:{flushStore:vi.fn()},
      setDevicePermissionHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn() },
    } },
  };
});
vi.mock('electron', () => electron);
vi.mock('node:fs', async importOriginal => ({...await importOriginal<typeof import('node:fs')>(), mkdirSync:vi.fn()}));
vi.mock('./db', () => ({ openStore: () => ({ settings: { get: () => ({}) }, close: mocks.closeStore }) }));
vi.mock('./updates/runtime', () => ({createUpdates: vi.fn(() => ({snapshot:()=>({installing:mocks.installing})}))}));
vi.mock('./ipc', () => ({ registerIpc: (...args:unknown[]) => mocks.registerIpc(...args) }));
vi.mock('./ipc/register', () => ({ createIpcRegistrar: () => ({ handle: vi.fn((name:string,handler:(...args:unknown[]) => Promise<unknown>) => mocks.handlers.set(name,handler)) }) }));
vi.mock('./services/secrets', () => ({ createSecretStore: vi.fn() }));
vi.mock('./services/delete-data', () => ({ createDataDeletion: vi.fn(() => vi.fn()), cleanupDeletedData: vi.fn(async () => true), finishPendingDeletion: vi.fn(async () => true) }));
vi.mock('./assets', () => ({ assetHandler: vi.fn() }));
vi.mock('./theme', () => ({ applyNativeTheme: vi.fn(), nativeBackground: () => '#ffffff' }));
vi.mock('./moodle/sso-protocol', () => ({ initializeMoodleProtocol: mocks.initialize }));
vi.mock('./storage/reconcile', () => ({ reconcileDownloads: vi.fn() }));
vi.mock('./storage/restore-startup', () => ({ confirmRestoreStartup: mocks.confirm, rollbackRestoreStartup: mocks.rollback }));
vi.mock('./storage/backup', () => ({ recoverRestore: vi.fn() }));
vi.mock('./logging', () => ({ log: mocks.log, stopFileLogging: vi.fn(), logDeletionFailure:mocks.logDeletionFailure, copyDiagnostics: mocks.copyDiagnostics }));
vi.mock('./dialogs', () => ({ showAttachedMessage: mocks.showMessage, showStartupError: mocks.fatal }));
vi.mock('./window-state', () => ({readWindowState: () => ({width:1200,height:800,maximized:false}), trackWindowState:vi.fn()}));
vi.mock('./shutdown', () => ({ coordinateShutdown: (phases:{stopWork:()=>Promise<void>}) => {mocks.shutdownWork=phases.stopWork;return vi.fn();} }));
vi.mock('./ownership', async importOriginal => ({...await importOriginal<typeof import('./ownership')>(), acquireOwnership: (_app: unknown, _window: unknown, restore: () => void) => { mocks.restore = restore; return true; } }));
vi.mock('./i18n', () => ({ tr: (key: string) => key }));
vi.mock('./packaged-smoke', () => ({ runPackagedSmoke: vi.fn() }));

const eventProcess: EventEmitter = process;
let processListeners: Map<string, ReturnType<EventEmitter['rawListeners']>>;
beforeEach(() => {
  processListeners = new Map(['exit', 'uncaughtExceptionMonitor', 'unhandledRejection'].map(event => [event, eventProcess.rawListeners(event)]));
  vi.resetModules();
  vi.clearAllMocks();
  mocks.installing=false;
  mocks.handlers.clear();
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
  await vi.waitFor(() => expect(electron.BrowserWindow.instances).toHaveLength(2));
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
  vi.useFakeTimers();
  const window = await start();
  window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  const emit = () => event === 'unresponsive' ? window.emit(event) : window.webContents.emit(event, {}, {reason:'crashed', exitCode:1});
  if (event === 'unresponsive') {
    for (let i=0;i<3;i++) { emit(); await vi.advanceTimersByTimeAsync(10_000); }
  } else { emit(); emit(); emit(); emit(); }
  expect(window.webContents.reload).toHaveBeenCalledTimes(2);
  expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
  expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({buttons:['common:menu_quit','common:copy_diagnostics']}));
  await vi.waitFor(() => expect(mocks.copyDiagnostics).toHaveBeenCalledOnce());
  expect(electron.app.exit).not.toHaveBeenCalled();
});
it('allows recovery again after the 60-second reload budget expires', async () => {
  vi.useFakeTimers();
  const window = await start();
  for (let i=0; i<2; i++) window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
  await vi.advanceTimersByTimeAsync(60_001);
  window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
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
  window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  for (let i=0;i<3;i++) window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
  await vi.waitFor(() => expect(electron.app.quit).toHaveBeenCalledOnce());
});
it('rolls back restored startup when renderer recovery is exhausted', async () => {
  mocks.rollback.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const window = await start();
  for (let i=0;i<3;i++) window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
  await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(1));
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.rollback).toHaveBeenCalledTimes(2);
  expect(electron.app.relaunch).toHaveBeenCalledOnce();
  window.webContents.emit('did-finish-load');
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each([false,true].flatMap(restoring => [0,1].map(response => ({restoring,response}))))('waits for first-load recovery diagnostics before exiting (restore=$restoring, response=$response)', async ({restoring,response}) => {
  let answer!: (result: {response:number}) => void;
  electron.dialog.showMessageBox.mockImplementationOnce(() => new Promise(resolve => {answer=resolve;}));
  mocks.rollback.mockResolvedValueOnce(false).mockResolvedValueOnce(restoring);
  const window=await start();
  for (let i=0;i<3;i++) window.webContents.emit('render-process-gone', {}, {reason:'crashed',exitCode:1});
  await vi.waitFor(() => expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce());
  expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(window,expect.objectContaining({buttons:['common:menu_quit','common:copy_diagnostics']}));
  await new Promise(resolve => setTimeout(resolve,20));
  expect(electron.app.exit).not.toHaveBeenCalled();
  expect(electron.app.quit).not.toHaveBeenCalled();
  expect(mocks.fatal).not.toHaveBeenCalled();
  expect(mocks.closeStore).not.toHaveBeenCalled();
  window.webContents.emit('did-finish-load');
  expect(mocks.confirm).not.toHaveBeenCalled();
  answer({response});
  await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(1));
  expect(mocks.copyDiagnostics).toHaveBeenCalledTimes(response===1?1:0);
  expect(mocks.closeStore).toHaveBeenCalledOnce();
  expect(mocks.rollback).toHaveBeenCalledTimes(2);
  expect(electron.app.relaunch).toHaveBeenCalledTimes(restoring?1:0);
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.fatal).not.toHaveBeenCalled();
});

it('queues second launches until startup and the store are ready', async () => {
  let release!: () => void;
  mocks.rollback.mockImplementationOnce(() => new Promise<boolean>(resolve => {release=()=>resolve(false);}));
  await import('./index');
  await vi.waitFor(() => expect(mocks.rollback).toHaveBeenCalledOnce());
  mocks.restore!(); mocks.restore!();
  await Promise.resolve();
  expect(electron.BrowserWindow.instances).toHaveLength(0);
  expect(electron.app.exit).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(electron.BrowserWindow.instances).toHaveLength(1));
  const window = electron.BrowserWindow.instances[0]!;
  window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(window.focus).toHaveBeenCalled());
  expect(electron.BrowserWindow.instances).toHaveLength(1);
});
function rejectInMain(reason: unknown) {
  const listener = eventProcess.rawListeners('unhandledRejection').find(listener => !processListeners.get('unhandledRejection')!.includes(listener))!;
  listener(reason);
}
it('logs unhandled rejections after startup and keeps the app running', async () => {
  const window = await start(); window.webContents.emit('did-finish-load');
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  rejectInMain(Error('runtime failure'));
  expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({phase:'main-unhandled-rejection'}));
  expect(electron.app.exit).not.toHaveBeenCalled();
  expect(mocks.fatal).not.toHaveBeenCalled();
});
it('shows fatal startup rejections before exiting', async () => {
  await start();
  const error = Error('startup rejection'); rejectInMain(error);
  expect(mocks.fatal).toHaveBeenCalledWith(error, 'window');
  expect(electron.app.exit).toHaveBeenCalledWith(1);
});
it('settles deferred second launches after startup fails', async () => {
  mocks.rollback.mockRejectedValueOnce(Error('restore failed'));
  await import('./index'); mocks.restore!();
  await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(1));
  expect(electron.BrowserWindow.instances).toHaveLength(0);
  expect(mocks.fatal).toHaveBeenCalledWith(expect.any(Error), 'recovery');
});

it('reports synchronous bootstrap failure before any window or store exists', async () => {
  const error=Error('protocol registration failed');
  mocks.initialize.mockImplementationOnce(()=>{throw error;});
  await expect(import('./index')).resolves.toBeDefined();
  expect(mocks.fatal).toHaveBeenCalledWith(error,'services');
  expect(electron.app.exit).toHaveBeenCalledWith(1);
  expect(electron.BrowserWindow.instances).toHaveLength(0);
});
it('reports uncaught startup exceptions with a safe fatal message', async () => {
  await start();
  const error=Error('uncaught during startup');
  const listener=eventProcess.rawListeners('uncaughtExceptionMonitor').find(listener=>!processListeners.get('uncaughtExceptionMonitor')!.includes(listener))!;
  listener(error);
  expect(mocks.fatal).toHaveBeenCalledWith(error,'window');
  expect(electron.app.exit).toHaveBeenCalledWith(1);
});

it('does not recover renderer failures belonging to another window', async () => {
  const main=await start();
  electron.app.emit('render-process-gone', {}, {reload:vi.fn()}, {reason:'crashed',exitCode:1});
  expect(main.webContents.reload).not.toHaveBeenCalled();
  expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
});

it('waits ten seconds before recovering a persistently unresponsive renderer', async () => {
  vi.useFakeTimers();
  const window=await start();
  window.emit('unresponsive');
  await vi.advanceTimersByTimeAsync(9_999);
  expect(window.webContents.reload).not.toHaveBeenCalled();
  window.emit('unresponsive');
  await vi.advanceTimersByTimeAsync(1);
  expect(window.webContents.reload).toHaveBeenCalledOnce();
});
it.each(['responsive','closed','render-process-gone'])('cancels pending hang recovery on %s', async event => {
  vi.useFakeTimers();
  const window=await start();
  window.emit('unresponsive');
  await vi.advanceTimersByTimeAsync(5_000);
  if (event==='render-process-gone') window.webContents.emit(event,{}, {reason:'crashed',exitCode:1});
  else window.emit(event);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(window.webContents.reload).toHaveBeenCalledTimes(event==='render-process-gone' ? 1 : 0);
  if (event==='responsive') {
    window.emit('unresponsive');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(window.webContents.reload).toHaveBeenCalledOnce();
  }
});
it('does not reload a clean renderer exit', async () => {
  const window=await start();
  window.webContents.emit('render-process-gone',{}, {reason:'clean-exit',exitCode:0});
  expect(window.webContents.reload).not.toHaveBeenCalled();
});

it('returns the main window to privileged callers even without OS focus',async()=>{
  const window=await start();
  window.webContents.emit('did-finish-load');
  await vi.waitFor(()=>expect(mocks.confirm).toHaveBeenCalledOnce());
  const restore=mocks.registerIpc.mock.calls[0]![3] as ()=>Promise<unknown>;
  expect(await restore()).toBe(window);
  expect(window.focus).toHaveBeenCalledOnce();
});

it('flushes default cookies without opening partition contexts during deletion', async () => {
  const window = await start();
  const {finishPendingDeletion} = await import('./services/delete-data');
  const clear = vi.mocked(finishPendingDeletion).mock.calls[0]![1];
  await clear(['web-chat-test']);
  expect(electron.session.fromPath).not.toHaveBeenCalled();
  expect(electron.session.defaultSession.cookies.flushStore).toHaveBeenCalled();
  window.webContents.emit('did-finish-load');
});

it('bounds startup session deletion even when Chromium never responds', async () => {
  const window = await start();
  const {finishPendingDeletion} = await import('./services/delete-data');
  const clear=vi.mocked(finishPendingDeletion).mock.calls[0]![1];
  electron.session.defaultSession.clearStorageData.mockImplementationOnce(() => new Promise(() => {}));
  vi.useFakeTimers();
  try {
    let settled=false;
    void clear([]).catch(() => {}).finally(() => {settled=true;});
    await vi.advanceTimersByTimeAsync(12_001);
    expect(settled).toBe(true);
  } finally {vi.useRealTimers();window.webContents.emit('did-finish-load');}
});

it('reports deletion errors with a failure title in one unparented notice', async () => {
  const window=await start();
  const {createDataDeletion}=await import('./services/delete-data');
  const report=vi.mocked(createDataDeletion).mock.calls[0]![2];
  await report(Object.assign(Error('/private/secret/path'),{code:'EACCES'}),true);
  expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
    title:'settings:delete_failure_title',message:'settings:delete_failed',
  }));
  window.webContents.emit('did-finish-load');
});

it('rejects a second deletion request while the first waits for app readiness', async () => {
  const window=await start();
  const handler=mocks.handlers.get('settings:deleteAllData')!;
  const pending=handler({}, {sender:window.webContents});
  const second=handler({}, {sender:window.webContents}).catch(error => String(error));
  try {
    const result=await Promise.race([second,new Promise(resolve => setTimeout(() => resolve('waiting'),100))]);
    expect(result).toContain('settings.delete_in_progress');
  } finally {
    window.webContents.emit('did-finish-load');
    await Promise.allSettled([pending,second]);
  }
});

it('blocks update installation while deletion confirmation is pending and releases on cancel', async () => {
  const window=await start();
  const options=mocks.registerIpc.mock.calls[0]![4] as {canInstallUpdate:()=>boolean};
  window.webContents.emit('did-finish-load');
  await vi.waitFor(()=>expect(mocks.confirm).toHaveBeenCalledOnce());
  expect(options.canInstallUpdate()).toBe(true);
  let answer!:(value:{response:number})=>void;
  mocks.showMessage.mockImplementationOnce(()=>new Promise(resolve=>{answer=resolve;}));
  const pending=mocks.handlers.get('settings:deleteAllData')!({}, {sender:window.webContents});
  await vi.waitFor(()=>expect(answer).toBeDefined());
  expect(options.canInstallUpdate()).toBe(false);
  answer({response:0});await pending;
  expect(options.canInstallUpdate()).toBe(true);
});
it('rejects deletion once an update install is quitting the app', async () => {
  const window=await start();mocks.installing=true;
  await expect(mocks.handlers.get('settings:deleteAllData')!({}, {sender:window.webContents})).rejects.toThrow('settings.delete_in_progress');
  expect(mocks.showMessage).not.toHaveBeenCalled();
  window.webContents.emit('did-finish-load');
});
it('normal quit flushes renderer drafts before disposing IPC', async () => {
  const window=await start();window.webContents.emit('did-finish-load');
  const send=vi.fn();
  Object.assign(window.webContents,{isLoading:()=>false,send});
  const work=mocks.shutdownWork!();
  expect(send).toHaveBeenCalled();
  expect(mocks.dispose).not.toHaveBeenCalled();
  // An unavailable renderer is bounded by the same production draft-flush timeout.
  await work;
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.log).toHaveBeenCalledWith({phase:'draft-flush',outcome:'timeout'});
});
it('blocks updates when startup deletion could not finish', async () => {
  const {finishPendingDeletion}=await import('./services/delete-data');
  vi.mocked(finishPendingDeletion).mockResolvedValueOnce(false);
  const window=await start();
  const options=mocks.registerIpc.mock.calls[0]![4] as {canInstallUpdate:()=>boolean};
  expect(options.canInstallUpdate()).toBe(false);
  window.webContents.emit('did-finish-load');
});
it('keeps updates blocked once deletion shutdown starts', async () => {
  const window=await start();window.webContents.emit('did-finish-load');
  await vi.waitFor(()=>expect(mocks.confirm).toHaveBeenCalledOnce());
  const {createDataDeletion}=await import('./services/delete-data');
  const stop=vi.mocked(createDataDeletion).mock.calls[0]![1];
  await stop();
  const options=mocks.registerIpc.mock.calls[0]![4] as {canInstallUpdate:()=>boolean};
  expect(options.canInstallUpdate()).toBe(false);
  expect(mocks.dispose).toHaveBeenCalledWith(true);
});
