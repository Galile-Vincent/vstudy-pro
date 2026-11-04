import { log } from '../logging';
import { tr } from '../../shared/i18n';
import { verifyCallback } from './callback';
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { sameSiteDomain, type CheckedSite } from './discovery';
import { networkUrl } from './site-url';
import { ssoProtocol } from './sso-protocol';
import { MoodleAuthError, type MoodleTokens } from './auth';
import type { MoodleSsoMode } from '../../shared/moodle';

type Outcome = {kind:'success';tokens:MoodleTokens} | {kind:'error';error:MoodleAuthError};
type Pending = {mode:MoodleSsoMode;cancel:(error:MoodleAuthError) => void};
function hostOf(target: string): string {
  try { return new URL(target).hostname; } catch { return 'invalid'; }
}

export class MoodleSso {
  private readonly pending = new Map<string,Pending>();
  private disposed = false;
  state(siteUrl: string) { return this.pending.get(siteUrl)?.mode ?? null; }
  cancel(siteUrl: string) { this.pending.get(siteUrl)?.cancel(new MoodleAuthError('cancelled')); }
  async login<T>(site: CheckedSite, providerIndex: number | undefined, accept: (tokens: MoodleTokens) => Promise<T>): Promise<T> {
    if (site.authPlan.kind !== 'browser' && site.authPlan.kind !== 'embedded') throw new MoodleAuthError('requirecorrectaccess');
    if (this.disposed) throw new MoodleAuthError('disposed');
    if (this.pending.has(site.siteUrl)) throw new MoodleAuthError('requirecorrectaccess');
    networkUrl(site.siteUrl);
    const provider = providerIndex === undefined ? undefined : site.authPlan.providers[providerIndex];
    if (providerIndex !== undefined && !provider) throw new MoodleAuthError('requirecorrectaccess');
    const signatureSites = [site.siteUrl];
    if (site.config.wwwroot && sameSiteDomain(site.siteUrl,site.config.wwwroot)) signatureSites.push(site.config.wwwroot);
    const passport = randomBytes(32).toString('hex');
    const launch = networkUrl(site.config.launchurl || `${site.siteUrl}/admin/tool/mobile/launch.php`);
    launch.search = new URLSearchParams({service:'moodle_mobile_app',passport,urlscheme:'vstudymoodle'}).toString();
    if (provider) {
      const id = new URL(provider.url).searchParams.get('id');
      if (id && /^\d+$/.test(id)) launch.searchParams.set('oauthsso',id);
    }
    const mode: MoodleSsoMode = site.authPlan.kind === 'browser' && ssoProtocol.available ? 'external' : 'embedded';
    log({phase:'moodle-sso-mode',host:launch.hostname,mode});
    return new Promise<T>((resolve,reject) => {
      let settled = false;
      let failure: MoodleAuthError | undefined;
      let recoveryUrl: string | undefined;
      const isolated = mode === 'embedded' ? session.fromPartition(`moodle-${randomBytes(16).toString('hex')}`) : undefined;
      const window = isolated ? new BrowserWindow({width:600,height:760,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}}) : undefined;
      let unsubscribe = () => {};
      const diagnostic = (phase: string, code: string, target: string) => {
        let scheme = 'invalid', port = '';
        try { const url = new URL(target); scheme = url.protocol; port = url.port || (scheme === 'https:' ? '443' : ''); } catch { /* Invalid URLs have no network metadata. */ }
        log({phase:`moodle-sso-${phase}`,code,host:hostOf(target),scheme,port,mode});
      };
      const finish = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        this.pending.delete(site.siteUrl);
        if (window && !window.isDestroyed()) window.destroy();
        void isolated?.clearStorageData().catch(() => diagnostic('cleanup','STORAGE_CLEAR_FAILED',site.siteUrl));
        if (outcome.kind === 'error') {
          if (outcome.error.code !== 'cancelled') diagnostic('outcome',outcome.error.reason ?? outcome.error.code,site.siteUrl);
          reject(outcome.error);
        } else void Promise.resolve().then(() => accept(outcome.tokens)).then(resolve,reject);
      };
      const timer = setTimeout(() => finish({kind:'error',error:failure ?? new MoodleAuthError('timeout')}),10 * 60_000);
      this.pending.set(site.siteUrl,{mode,cancel:error => finish({kind:'error',error})});
      const callback = (target: string, phase: string, external = false): boolean => {
        if (!/^vstudymoodle:/i.test(target)) return false;
        if (settled) return true;
        try { finish({kind:'success',tokens:verifyCallback(target,signatureSites,passport,signedSite => diagnostic('signature',new URL(signedSite).protocol === 'https:' ? 'HTTPS_MATCH' : 'HTTP_MATCH',signedSite))}); }
        catch (error) {
          if (external) return false;
          diagnostic(phase,error instanceof MoodleAuthError ? error.reason ?? error.code : 'malformed',site.siteUrl);
          finish({kind:'error',error:error instanceof MoodleAuthError ? error : new MoodleAuthError('callback-invalid','malformed')});
        }
        return true;
      };
      if (mode === 'external') {
        unsubscribe = ssoProtocol.subscribe(target => callback(target,'protocol',true));
        void ssoProtocol.open(launch.href).catch((error: {code?:string}) => {
          diagnostic('external',error.code ?? 'OPEN_FAILED',launch.href);
          finish({kind:'error',error:new MoodleAuthError('load-failed')});
        });
        return;
      }
      isolated!.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
      isolated!.setPermissionCheckHandler(() => false);
      const browser = window!;
      browser.webContents.setWindowOpenHandler(() => ({action:'deny'}));
      browser.webContents.on('will-attach-webview',event => event.preventDefault());
      const showFailure = (error: MoodleAuthError, code: string, target: string) => {
        if (settled || browser.isDestroyed() || recoveryUrl) return;
        failure = error;
        diagnostic('load',code,target);
        const escape = (text: string) => text.replace(/[&<>"']/g,char => `&#${char.charCodeAt(0)};`);
        recoveryUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<html><meta charset="utf-8"><title>${escape(tr('moodle:sign_in'))}</title><body><h1>${escape(tr(`moodle:auth_${error.code}`))}</h1><small>${escape(hostOf(target))} · ${escape(code)}</small><p><a href="${escape(launch.href)}">${escape(tr('moodle:sso_retry'))}</a></p></body></html>`);
        void browser.loadURL(recoveryUrl).catch(() => finish({kind:'error',error}));
      };
      const load = () => {
        failure = undefined;
        void browser.loadURL(launch.href).catch((error: {code?:string}) => {
          if (settled || recoveryUrl || error.code === 'ERR_ABORTED') return;
          showFailure(new MoodleAuthError('load-failed'),error.code ?? 'LOAD_FAILED',launch.href);
        });
      };
      const navigate = (event: Electron.Event, target: string) => {
        if (callback(target,'navigate')) { event.preventDefault(); return; }
        if (target === recoveryUrl || target === 'about:blank') return;
        if (recoveryUrl && target === launch.href) {
          event.preventDefault(); recoveryUrl = undefined; load(); return;
        }
        try {
          if (new URL(target).protocol !== 'https:') throw new Error('scheme');
          diagnostic('navigate','ALLOW',target);
        } catch { event.preventDefault(); showFailure(new MoodleAuthError('blocked'),'SCHEME_REJECTED',target); }
      };
      browser.webContents.on('will-navigate',navigate);
      browser.webContents.on('will-redirect',(event,target,_inPlace,isMainFrame) => { if (isMainFrame) navigate(event,target); });
      browser.webContents.on('will-frame-navigate',event => {
        if (event.isMainFrame) navigate(event,event.url);
        else diagnostic('subframe','ALLOW',event.url);
      });
      browser.webContents.on('did-fail-load',(_event,code,description,target,isMainFrame) => {
        if (!isMainFrame || settled || callback(target,'failed-navigation') || code === -3 || target === recoveryUrl) return;
        showFailure(new MoodleAuthError('load-failed'),description || String(code),target);
      });
      browser.on('closed',() => finish({kind:'error',error:failure ?? new MoodleAuthError('cancelled')}));
      load();
    });
  }
  dispose() { this.disposed = true; for (const pending of this.pending.values()) pending.cancel(new MoodleAuthError('disposed')); }
}
