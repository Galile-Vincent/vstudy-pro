import {waitForUpdateWork} from './wait';
import { recordEgress } from '../services/egress';
import type { AppUpdater } from 'electron-updater';
import type { UpdateSnapshot, UpdateState } from '../../shared/updates';
import { reduceUpdate, updateError, type UpdateEvent } from './state';
type Updater = Pick<AppUpdater, 'on' | 'removeListener' | 'checkForUpdates' | 'downloadUpdate'
  | 'quitAndInstall' | 'autoDownload' | 'allowDowngrade' | 'allowPrerelease' | 'autoInstallOnAppQuit'> & {cancelInstall?: () => void};
export class Updates {
  private state: UpdateState;
  private lastCheckedAt: number | null = null;
  private automatic: boolean;
  private lastManualAttempt = -Infinity;
  private lastAttempt = -Infinity;
  private result: UpdateSnapshot['result'];
  private manual = false;
  private checkFailed = false;
  private installing = false;
  private waiting = false;
  private waitAbort: AbortController | undefined;
  private installError = false;
  private installTimer: ReturnType<typeof setTimeout> | undefined;
  private quietState: UpdateState | undefined;
  private listeners = new Set<(snapshot: UpdateSnapshot) => void>();
  private timer: ReturnType<typeof setTimeout>;
  private monitor: ReturnType<typeof setInterval>;
  private disposed = false;
  private firstCheck = false;
  private wasOnline = false;
  private interval: ReturnType<typeof setInterval>;
  private events: [Parameters<Updater['on']>[0], (...args: never[]) => void][] = [];
  constructor(private updater: Updater, private options: {
    unsupported?: Extract<UpdateState, {status:'unsupported'}>['reason'] | undefined;
    version: string; automatic: boolean; online: () => boolean;
    getAutomatic?: () => boolean; ready?: () => boolean;
    saveAutomatic: (enabled: boolean) => void; now?: () => number;
  }) {
    this.state = options.unsupported ? {status:'unsupported', reason:options.unsupported} : {status:'idle'};
    this.automatic = options.automatic;
    this.attach(updater);
    this.timer = setTimeout(() => { void this.automaticCheck(); }, 15_000);
    this.monitor = setInterval(() => {
      const online = this.options.online();
      if (!this.firstCheck || online && !this.wasOnline) void this.automaticCheck();
      this.wasOnline = online;
    }, 15_000);
    this.interval = setInterval(() => { void this.automaticCheck(); }, 6 * 60 * 60_000);
  }
  private async automaticCheck() {
    try {
      if (!this.automaticEnabled() || !(this.options.ready?.() ?? true) || !this.options.online()) return;
    } catch { return; }
    if (this.state.status === 'unsupported') return;
    this.firstCheck = true;
    await this.check(false);
  }
  initialize(updater: Updater, unsupported?: Extract<UpdateState, {status:'unsupported'}>['reason']) {
    if (this.disposed) return;
    for (const [name, callback] of this.events) this.updater.removeListener(name, callback);
    this.events = [];
    this.updater = updater;
    this.state = unsupported ? {status:'unsupported',reason:unsupported} : {status:'idle'};
    this.attach(updater); this.emit();
  }
  private attach(updater: Updater) {
    updater.autoDownload = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.autoInstallOnAppQuit = false;
    const on = (name: Parameters<Updater['on']>[0], callback: (...args: never[]) => void) => {
      updater.on(name, callback); this.events.push([name, callback]);
    };
    on('update-available', (info: {version:string; files?:{size?:number}[]}) => this.dispatch({type:'available', version:info.version, size:info.files?.[0]?.size}));
    on('update-not-available', () => this.dispatch({type:'current'}));
    on('download-progress', (info: {percent:number}) => this.dispatch({type:'progress', percent:info.percent}));
    on('update-downloaded', (info: {version:string}) => this.dispatch({type:'ready', version:info.version}));
    on('error', (error: Error) => this.failed(error));
  }
  private automaticEnabled() {
    try { this.automatic = this.options.getAutomatic?.() ?? this.automatic; }
    catch { /* Shutdown may already have closed the settings store. */ }
    return this.automatic;
  }
  snapshot = (): UpdateSnapshot => ({state:this.state.status === 'checking' && this.quietState ? this.quietState : this.state, currentVersion:this.options.version,
    lastCheckedAt:this.lastCheckedAt, automatic:this.automaticEnabled(), installing:this.installing, waiting:this.waiting, installError:this.installError, ...(this.result ? {result:this.result} : {})});
  subscribe(listener: (snapshot: UpdateSnapshot) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private emit() { for (const listener of this.listeners) listener(this.snapshot()); }
  private dispatch(event: UpdateEvent) {
    if (event.type === 'error' && !this.manual && this.state.status === 'checking') {
      this.state = this.quietState ?? {status:'idle'}; this.quietState = undefined; this.emit(); return;
    }
    try { this.state = reduceUpdate(this.state, event); }
    catch { this.state = {status:'error', code:'failed'}; }
    if ((event.type === 'available' && this.state.status === 'available') ||
      (event.type === 'current' && this.state.status === 'idle')) {
      this.lastCheckedAt = (this.options.now ?? Date.now)();
      if (this.manual) this.result = event.type === 'current' ? 'current' : 'checked';
    }
    if (event.type === 'error') this.updater.autoInstallOnAppQuit = false;
    this.emit();
  }
  private failed(error: unknown) {
    if (this.installing || this.installError && this.state.status === 'ready') { this.installFailed(); return; }
    if (this.checkFailed) return;
    this.checkFailed = true;
    if ((error as {code?:unknown})?.code === 'NO_STABLE_UPDATE') this.dispatch({type:'current'});
    else this.dispatch({type:'error',code:updateError(error)});
  }
  async check(manual = true) {
    if (manual && this.state.status === 'checking' && this.quietState) {
      this.manual = true; this.quietState = undefined; this.emit();
    }
    if (!['idle', 'error', 'available'].includes(this.state.status)) return this.snapshot();
    this.manual = manual; this.checkFailed = false;
    if (!this.options.online()) {
      if (manual) { this.result = 'offline'; this.dispatch({type:'error',code:'offline'}); }
      return this.snapshot();
    }
    const now = (this.options.now ?? Date.now)();
    if (manual && now - this.lastManualAttempt < 3000) {
      this.result = 'cooldown'; this.emit(); return this.snapshot();
    }
    if (!manual && now - this.lastAttempt < 600_000) return this.snapshot();
    if (manual) this.lastManualAttempt = now;
    this.lastAttempt = now;
    this.result = undefined;
    this.quietState = manual ? undefined : this.state;
    this.dispatch({type:'check'});
    recordEgress('app_update_check', 'https://github.com/ava-apple/vstudy-pro/releases/latest/download');
    try { await this.updater.checkForUpdates(); }
    catch (error) { this.failed(error); }
    return this.snapshot();
  }
  async download() {
    if (this.state.status !== 'available') return this.snapshot();
    this.manual = true; this.quietState = undefined; this.result = undefined;
    if (!this.options.online()) { this.dispatch({type:'error', code:'offline'}); return this.snapshot(); }
    recordEgress('app_update_download', 'https://github.com/ava-apple/vstudy-pro/releases/latest/download');
    this.updater.autoInstallOnAppQuit = false;
    this.dispatch({type:'download'});
    void this.updater.downloadUpdate().catch(error => this.dispatch({type:'error', code:updateError(error)}));
    return this.snapshot();
  }
  cancelWait() { this.waitAbort?.abort(); return this.snapshot(); }
  async waitForWork(work: () => Promise<void>, confirm: () => Promise<boolean>) {
    this.waitAbort = new AbortController(); this.waiting = true; this.emit();
    try {
      const result = await waitForUpdateWork(work, this.waitAbort.signal);
      if (result === 'cancelled') return false;
      if (result === 'timeout') return await confirm() && !this.waitAbort.signal.aborted;
      return true;
    } finally { this.waiting = false; this.waitAbort = undefined; this.emit(); }
  }
  private installFailed() {
    clearTimeout(this.installTimer);
    this.updater.cancelInstall?.();
    this.installing = false; this.installError = true; this.emit();
  }
  async install(prepare?: () => Promise<void>) {
    if (this.state.status === 'ready' && !this.installing) {
      this.installing = true; this.installError = false; this.emit();
      try {
        if (prepare) await prepare();
        this.installTimer = setTimeout(() => this.installFailed(), 60_000);
        this.updater.quitAndInstall();
      } catch { this.installFailed(); }
    }
    return this.snapshot();
  }
  setAuto(enabled: boolean) {
    this.options.saveAutomatic(enabled); this.automatic = enabled; this.emit(); return this.snapshot();
  }
  dispose() {
    this.disposed = true;
    this.waitAbort?.abort();
    clearTimeout(this.installTimer);
    clearTimeout(this.timer); clearInterval(this.interval); clearInterval(this.monitor);
    for (const [name, callback] of this.events) this.updater.removeListener(name, callback);
    this.listeners.clear();
  }
}
