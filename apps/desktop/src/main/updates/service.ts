import { recordEgress } from '../services/egress';
import type { AppUpdater } from 'electron-updater';
import type { UpdateSnapshot, UpdateState } from '../../shared/updates';
import { reduceUpdate, updateError, type UpdateEvent } from './state';
type Updater = Pick<AppUpdater, 'on' | 'removeListener' | 'checkForUpdates' | 'downloadUpdate'
  | 'quitAndInstall' | 'autoDownload' | 'allowDowngrade' | 'allowPrerelease' | 'autoInstallOnAppQuit'>;
export class Updates {
  private state: UpdateState;
  private lastCheckedAt: number | null = null;
  private automatic: boolean;
  private lastManualAttempt = -Infinity;
  private lastAttempt = -Infinity;
  private result: UpdateSnapshot['result'];
  private manual = false;
  private installing = false;
  private listeners = new Set<(snapshot: UpdateSnapshot) => void>();
  private timer: ReturnType<typeof setTimeout>;
  private interval: ReturnType<typeof setInterval>;
  private events: [Parameters<Updater['on']>[0], (...args: never[]) => void][] = [];
  constructor(private updater: Updater, private options: {
    unsupported?: Extract<UpdateState, {status:'unsupported'}>['reason'] | undefined;
    version: string; automatic: boolean; online: () => boolean;
    saveAutomatic: (enabled: boolean) => void; now?: () => number;
  }) {
    this.state = options.unsupported ? {status:'unsupported', reason:options.unsupported} : {status:'idle'};
    this.automatic = options.automatic;
    this.attach(updater);
    this.timer = setTimeout(() => { if (this.automatic) void this.check(false); }, 15_000);
    this.interval = setInterval(() => { if (this.automatic) void this.check(false); }, 6 * 60 * 60_000);
  }
  initialize(updater: Updater, unsupported?: Extract<UpdateState, {status:'unsupported'}>['reason']) {
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
    on('update-available', (info: {version:string}) => this.dispatch({type:'available', version:info.version}));
    on('update-not-available', () => this.dispatch({type:'current'}));
    on('download-progress', (info: {percent:number}) => this.dispatch({type:'progress', percent:info.percent}));
    on('update-downloaded', (info: {version:string}) => this.dispatch({type:'ready', version:info.version}));
    on('error', (error: Error) => this.dispatch({type:'error', code:updateError(error)}));
  }
  snapshot = (): UpdateSnapshot => ({state:this.state, currentVersion:this.options.version,
    lastCheckedAt:this.lastCheckedAt, automatic:this.automatic, installing:this.installing, ...(this.result ? {result:this.result} : {})});
  subscribe(listener: (snapshot: UpdateSnapshot) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private emit() { for (const listener of this.listeners) listener(this.snapshot()); }
  private dispatch(event: UpdateEvent) {
    if (event.type === 'available' || event.type === 'current') {
      this.lastCheckedAt = (this.options.now ?? Date.now)();
      if (this.manual) this.result = event.type === 'current' ? 'current' : 'checked';
    }
    try { this.state = reduceUpdate(this.state, event); }
    catch { this.state = {status:'error', code:'failed'}; }
    if (event.type === 'error') this.updater.autoInstallOnAppQuit = false;
    this.emit();
  }
  async check(manual = true) {
    if (!['idle', 'error', 'available'].includes(this.state.status)) return this.snapshot();
    this.manual = manual;
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
    this.dispatch({type:'check'});
    recordEgress('app_update_check', 'https://github.com/ava-apple/vstudy-pro/releases/latest/download');
    try { await this.updater.checkForUpdates(); }
    catch (error) { this.dispatch({type:'error', code:updateError(error)}); }
    return this.snapshot();
  }
  async download() {
    if (this.state.status !== 'available') return this.snapshot();
    if (!this.options.online()) { this.dispatch({type:'error', code:'offline'}); return this.snapshot(); }
    recordEgress('app_update_download', 'https://github.com/ava-apple/vstudy-pro/releases/latest/download');
    this.updater.autoInstallOnAppQuit = false;
    this.dispatch({type:'download'});
    void this.updater.downloadUpdate().catch(error => this.dispatch({type:'error', code:updateError(error)}));
    return this.snapshot();
  }
  install() {
    if (this.state.status === 'ready' && !this.installing) {
      this.installing = true; this.emit();
      try { this.updater.quitAndInstall(); }
      catch { this.dispatch({type:'error',code:'integrity'}); }
    }
    return this.snapshot();
  }
  setAuto(enabled: boolean) {
    this.options.saveAutomatic(enabled); this.automatic = enabled; this.emit(); return this.snapshot();
  }
  dispose() {
    clearTimeout(this.timer); clearInterval(this.interval);
    for (const [name, callback] of this.events) this.updater.removeListener(name, callback);
    this.listeners.clear();
  }
}
