/**
 * Own isolated login windows, one-time callback verification, and SSO cleanup.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { log } from '../logging';
import { tr } from '../../shared/i18n';
import { isCallbackCandidate, verifyCallback } from './callback';
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { sameSiteDomain, type CheckedSite } from './discovery';
import { networkUrl } from './site-url';
import { ssoProtocol } from './sso-protocol';
import { MoodleAuthError, type MoodleTokens } from './auth';
import type { MoodleSsoMode } from '../../shared/moodle';

type Outcome = {kind:'success';tokens:MoodleTokens} | {kind:'error';error:MoodleAuthError};
type Pending = {mode:MoodleSsoMode;cancel:(error:MoodleAuthError) => void};
/** Retain only safe origin or scheme metadata from an SSO URL. */
export function diagnosticUrl(target: string): {scheme:string;host?:string;port?:string} {
  try {
    const url = new URL(target);
    if (/^[a-z][a-z0-9+.-]*:\/\/token=/i.test(target) || url.protocol !== 'https:' && url.protocol !== 'http:') return {scheme:url.protocol};
    return {scheme:url.protocol,host:url.hostname,port:url.port || (url.protocol === 'https:' ? '443' : '80')};
  } catch { return {scheme:'invalid'}; }
}
type SsoOptions = {mode:'embedded'} | {mode:'external';callbackScheme:'vstudymoodle'};
const retryUrl = 'https://vstudy.invalid/moodle-sso-retry';
const loadCodes = new Map([
  [-105,'ERR_NAME_NOT_RESOLVED'],[-130,'ERR_PROXY_CONNECTION_FAILED'],
  [-111,'ERR_TUNNEL_CONNECTION_FAILED'],[-102,'ERR_CONNECTION_REFUSED'],
  [-101,'ERR_CONNECTION_RESET'],[-302,'ERR_UNKNOWN_URL_SCHEME'],
]);
function loadCode(code: unknown): string {
  return typeof code === 'string' && [...loadCodes.values()].includes(code) ? code : 'LOAD_FAILED';
}

/** Own one isolated login attempt and clean up listeners and sessions on every terminal path. */
export class MoodleSso {
  private readonly pending = new Map<string,Pending>();
  private disposed = false;
  constructor(private readonly restoreMainWindow: () => void = () => {}) {}
  state(siteUrl: string) { return this.pending.get(siteUrl)?.mode ?? null; }
  cancel(siteUrl: string) { this.pending.get(siteUrl)?.cancel(new MoodleAuthError('cancelled')); }
  async login<T>(site: CheckedSite, providerIndex: number | undefined, accept: (tokens: MoodleTokens) => Promise<T>, options: SsoOptions = {mode:'embedded'}): Promise<T> {
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
    // A site can force moodlemobile, which belongs to the official app at OS level.
    const mode: MoodleSsoMode = options.mode === 'external' && options.callbackScheme === 'vstudymoodle' && site.authPlan.kind === 'browser' && ssoProtocol.available ? 'external' : 'embedded';
    log({phase:'moodle-sso-mode',...diagnosticUrl(launch.href),mode});
    return new Promise<T>((resolve,reject) => {
      let settled = false;
      let failure: MoodleAuthError | undefined;
      let callbackIgnored = false;
      let recoveryUrl: string | undefined;
      const isolated = mode === 'embedded' ? session.fromPartition(`moodle-${randomBytes(16).toString('hex')}`) : undefined;
      const window = isolated ? new BrowserWindow({width:600,height:760,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}}) : undefined;
      let unsubscribe = () => {};
      const diagnostic = (phase: string, code: string, target: string) => {
        log({phase:`moodle-sso-${phase}`,code,...diagnosticUrl(target),mode});
      };
      const finish = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        this.pending.delete(site.siteUrl);
        isolated?.webRequest.onBeforeRequest(null);
        if (window && !window.isDestroyed()) window.destroy();
        void isolated?.clearStorageData().catch(() => diagnostic('cleanup','STORAGE_CLEAR_FAILED',site.siteUrl));
        if (outcome.kind === 'error') {
          if (outcome.error.code !== 'cancelled') diagnostic('outcome',outcome.error.reason ?? outcome.error.code,site.siteUrl);
          reject(outcome.error);
        } else {
          this.restoreMainWindow();
          void Promise.resolve().then(() => accept(outcome.tokens)).then(resolve,reject);
        }
      };
      const timer = setTimeout(() => finish({kind:'error',error:failure ?? new MoodleAuthError('timeout')}),10 * 60_000);
      this.pending.set(site.siteUrl,{mode,cancel:error => finish({kind:'error',error})});
      const callback = (target: string, external = false): boolean => {
        if (!isCallbackCandidate(target) || mode === 'external' && !/^vstudymoodle:/i.test(target)) return false;
        if (settled) return true;
        try { finish({kind:'success',tokens:verifyCallback(target,signatureSites,passport,signedSite => diagnostic('signature',new URL(signedSite).protocol === 'https:' ? 'HTTPS_MATCH' : 'HTTP_MATCH',signedSite))}); }
        catch {
          if (external) return false;
          callbackIgnored = true;
          return true;
        }
        return true;
      };
      if (mode === 'external') {
        unsubscribe = ssoProtocol.subscribe(target => callback(target,true));
        void ssoProtocol.open(launch.href).catch(() => {
          diagnostic('external','OPEN_FAILED',launch.href);
          finish({kind:'error',error:new MoodleAuthError('load-failed')});
        });
        return;
      }
      isolated!.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
      isolated!.setPermissionCheckHandler(() => false);
      const browser = window!;
      browser.webContents.setWindowOpenHandler(() => ({action:'deny'}));
      browser.webContents.on('will-attach-webview',event => event.preventDefault());
      const showOrigin = (target: string) => { const host = diagnosticUrl(target).host; if (host && !browser.isDestroyed()) browser.setTitle(host); };
      browser.webContents.on('page-title-updated',event => event.preventDefault());
      showOrigin(launch.href);
      const showFailure = (error: MoodleAuthError, code: string, target: string) => {
        if (settled || browser.isDestroyed() || recoveryUrl) return;
        failure = error;
        diagnostic('load',code,target);
        const escape = (text: string) => text.replace(/[&<>"']/g,char => `&#${char.charCodeAt(0)};`);
        recoveryUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<html><meta charset="utf-8"><title>${escape(tr('moodle:sign_in'))}</title><body><h1>${escape(tr(`moodle:auth_${error.code}`))}</h1><small>${escape(diagnosticUrl(target).host ?? '')} · ${escape(code)}</small><p><a href="${retryUrl}">${escape(tr('moodle:sso_retry'))}</a></p></body></html>`);
        void browser.loadURL(recoveryUrl).catch(() => finish({kind:'error',error}));
      };
      const load = () => {
        failure = undefined;
        callbackIgnored = false;
        void browser.loadURL(launch.href).catch((error: {code?:string}) => {
          if (settled || recoveryUrl || callbackIgnored || error.code === 'ERR_ABORTED') return;
          showFailure(new MoodleAuthError('load-failed'),loadCode(error.code),launch.href);
        });
      };
      const navigate = (event: Electron.Event, target: string) => {
        if (callback(target)) { event.preventDefault(); return; }
        if (target === recoveryUrl || target === 'about:blank') return;
        if (recoveryUrl && target === retryUrl) {
          event.preventDefault(); recoveryUrl = undefined; load(); return;
        }
        try {
          if (new URL(target).protocol !== 'https:') throw new Error('scheme');
          diagnostic('navigate','ALLOW',target);
          showOrigin(target);
        } catch { event.preventDefault(); showFailure(new MoodleAuthError('blocked'),'SCHEME_REJECTED',target); }
      };
      isolated!.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,respond) => {
        const handled = details.resourceType === 'mainFrame' && callback(details.url);
        respond({cancel:handled});
      });
      browser.webContents.on('will-navigate',navigate);
      browser.webContents.on('will-redirect',(event,target,_inPlace,isMainFrame) => { if (isMainFrame) navigate(event,target); });
      browser.webContents.on('will-frame-navigate',event => {
        if (event.isMainFrame) navigate(event,event.url);
        else diagnostic('subframe','ALLOW',event.url);
      });
      browser.webContents.on('did-fail-load',(_event,code,_description,target,isMainFrame) => {
        if (!isMainFrame || settled || callback(target) || code === -3 || target === recoveryUrl) return;
        showFailure(new MoodleAuthError('load-failed'),loadCodes.get(code) ?? 'LOAD_FAILED',target);
      });
      browser.on('closed',() => finish({kind:'error',error:failure ?? new MoodleAuthError('cancelled')}));
      load();
    });
  }
  dispose() { this.disposed = true; for (const pending of this.pending.values()) pending.cancel(new MoodleAuthError('disposed')); }
}
