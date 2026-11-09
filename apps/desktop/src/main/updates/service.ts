import { recordEgress } from '../services/egress';
import type { AppUpdater } from 'electron-updater';
import type { UpdateSnapshot, UpdateState } from '../../shared/updates';
import { reduceUpdate, updateError, type UpdateEvent } from './state';
type Updater = Pick<AppUpdater, 'on' | 'removeListener' | 'checkForUpdates' | 'downloadUpdate'
  | 'quitAndInstall' | 'autoDownload' | 'allowDowngrade' | 'allowPrerelease' | 'autoInstallOnAppQuit'>;
export class Updates {
  private state: UpdateState;
  private offered: Extract<UpdateState, {status:'available'}> | undefined;
  private lastCheckedAt: number | null = null;
  private automatic: boolean;
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
    this.timer = setTimeout(() => { if (this.automatic) void this.check(); }, 15_000);
    this.interval = setInterval(() => { if (this.automatic) void this.check(); }, 6 * 60 * 60_000);
  }
  snapshot = (): UpdateSnapshot => ({state:this.state, currentVersion:this.options.version,
    lastCheckedAt:this.lastCheckedAt, automatic:this.automatic});
  subscribe(listener: (snapshot: UpdateSnapshot) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private emit() { for (const listener of this.listeners) listener(this.snapshot()); }
  private dispatch(event: UpdateEvent) {
    try { this.state = reduceUpdate(this.state, event); }
    catch { this.state = {status:'error', code:'failed'}; }
    if (this.state.status === 'available') this.offered = this.state;
    this.emit();
  }
  async check() {
    if (this.state.status === 'error' && this.offered && this.updater.autoInstallOnAppQuit) {
      this.state = this.offered; return this.download();
    }
    if (!['idle', 'error', 'available'].includes(this.state.status)) return this.snapshot();
    if (!this.options.online()) return this.snapshot();
    const now = (this.options.now ?? Date.now)();
    if (this.lastCheckedAt !== null && now - this.lastCheckedAt < 600_000) return this.snapshot();
    this.lastCheckedAt = now;
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
    this.updater.autoInstallOnAppQuit = true;
    this.dispatch({type:'download'});
    void this.updater.downloadUpdate().catch(error => this.dispatch({type:'error', code:updateError(error)}));
    return this.snapshot();
  }
  install() {
    if (this.state.status === 'ready') this.updater.quitAndInstall();
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
