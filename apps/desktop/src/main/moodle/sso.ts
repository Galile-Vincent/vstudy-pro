import { log } from '../logging';
import { tr } from '../../shared/i18n';
import { verifyCallback } from './callback';
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { sameSiteDomain, type CheckedSite } from './discovery';
import { networkUrl } from './site-url';
import { loginProxy } from './login-proxy';
import { MoodleAuthError, type MoodleTokens } from './auth';

type Outcome = {kind:'success';tokens:MoodleTokens} | {kind:'error';error:MoodleAuthError};

function hostOf(target: string): string {
  try { return new URL(target).hostname; } catch { return 'invalid'; }
}

export class MoodleSso {
  private readonly windows = new Set<BrowserWindow>();
  private disposed = false;
  async login<T>(site: CheckedSite, providerIndex: number | undefined, accept: (tokens: MoodleTokens) => Promise<T>): Promise<T> {
    if (site.authPlan.kind !== 'browser' && site.authPlan.kind !== 'embedded') throw new MoodleAuthError('requirecorrectaccess');
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
    if (this.disposed) throw new MoodleAuthError('disposed');
    let proxyFailure: ((host: string, code: string) => void) | undefined;
    const proxy = await loginProxy(undefined,(host,code) => proxyFailure?.(host,code));
    if (this.disposed) {proxy.close();throw new MoodleAuthError('disposed');}
    const isolated = session.fromPartition(`moodle-${randomBytes(16).toString('hex')}`);
    try { await isolated.setProxy({mode:'fixed_servers',proxyRules:`http=127.0.0.1:${proxy.port};https=127.0.0.1:${proxy.port}`,proxyBypassRules:'<-loopback>'}); }
    catch {proxy.close();log({phase:'moodle-sso-proxy',code:'SET_PROXY_FAILED',host:new URL(site.siteUrl).hostname});throw new MoodleAuthError('load-failed');}
    if (this.disposed) {proxy.close();void isolated.clearStorageData().catch(() => undefined);throw new MoodleAuthError('disposed');}
    isolated.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    const window = new BrowserWindow({width:600,height:760,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}});
    this.windows.add(window);
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-attach-webview',event => event.preventDefault());
    return new Promise<T>((resolve,reject) => {
      let settled = false;
      let failure: MoodleAuthError | undefined;
      let recoveryUrl: string | undefined;
      const diagnostic = (phase: string, code: string, target: string, resourceType?: string) => {
        let scheme = 'invalid', port = '';
        try { const url = new URL(target); scheme = url.protocol; port = url.port || (scheme === 'https:' ? '443' : ''); } catch { /* Invalid URLs have no network metadata. */ }
        log({phase:`moodle-sso-${phase}`,code,host:hostOf(target),scheme,port,resourceType});
      };
      const finish = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.windows.delete(window);
        isolated.webRequest.onBeforeRequest(null);
        isolated.webRequest.onBeforeRedirect(null);
        if (!window.isDestroyed()) window.destroy();
        proxy.close();
        void isolated.clearStorageData().catch(() => diagnostic('cleanup','STORAGE_CLEAR_FAILED',site.siteUrl));
        if (outcome.kind === 'error') {
          if (outcome.error.code !== 'cancelled') diagnostic('outcome',outcome.error.reason ?? outcome.error.code,site.siteUrl);
          reject(outcome.error);
        } else void Promise.resolve().then(() => accept(outcome.tokens)).then(resolve,reject);
      };
      const timer = setTimeout(() => finish({kind:'error',error:failure ?? new MoodleAuthError('timeout')}),10 * 60_000);
      const callback = (target: string, phase: string): boolean => {
        if (!/^vstudymoodle:/i.test(target)) return false;
        if (settled) return true;
        try { finish({kind:'success',tokens:verifyCallback(target,signatureSites,passport,signedSite => diagnostic('signature',new URL(signedSite).protocol === 'https:' ? 'HTTPS_MATCH' : 'HTTP_MATCH',signedSite))}); }
        catch (error) {
          diagnostic(phase,error instanceof MoodleAuthError ? error.reason ?? error.code : 'malformed',site.siteUrl);
          finish({kind:'error',error:error instanceof MoodleAuthError ? error : new MoodleAuthError('callback-invalid','malformed')});
        }
        return true;
      };
      const showFailure = (error: MoodleAuthError, code: string, target: string) => {
        if (settled || window.isDestroyed() || recoveryUrl) return;
        failure = error;
        diagnostic('load',code,target);
        const escape = (text: string) => text.replace(/[&<>"']/g,char => `&#${char.charCodeAt(0)};`);
        recoveryUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<html><meta charset="utf-8"><title>${escape(tr('moodle:sign_in'))}</title><body><h1>${escape(tr(`moodle:auth_${error.code}`))}</h1><a href="${escape(launch.href)}">${escape(tr('moodle:sso_retry'))}</a></body></html>`);
        void window.loadURL(recoveryUrl).catch(() => finish({kind:'error',error}));
      };
      proxyFailure = (host,code) => showFailure(new MoodleAuthError(code === 'HOST_REJECTED' || code === 'TARGET_REJECTED' ? 'blocked' : 'load-failed'),code,`https://${host}`);
      const load = () => {
        failure = undefined;
        void window.loadURL(launch.href).catch((error: {code?:string}) => {
          if (settled || recoveryUrl && window.webContents.getURL() === recoveryUrl) return;
          if (error.code === 'ERR_ABORTED') return;
          showFailure(new MoodleAuthError('load-failed'),error.code ?? 'LOAD_FAILED',launch.href);
        });
      };
      const navigate = (event: Electron.Event, target: string) => {
        diagnostic('navigate','CHECK',target);
        if (callback(target,'navigate')) { event.preventDefault(); return; }
        if (recoveryUrl && target === launch.href) {
          event.preventDefault(); recoveryUrl = undefined; load(); return;
        }
        try { networkUrl(target); }
        catch { event.preventDefault(); showFailure(new MoodleAuthError('blocked'),'URL_REJECTED',target); }
      };
      isolated.webRequest.onBeforeRequest((details,respond) => {
        diagnostic('request','CHECK',details.url,details.resourceType);
        if (/^vstudymoodle:/i.test(details.url)) { respond({cancel:true}); callback(details.url,'request'); return; }
        if (details.url === recoveryUrl) {respond({cancel:false});return;}
        try { networkUrl(details.url); respond({cancel:false}); }
        catch { respond({cancel:true}); if (details.resourceType === 'mainFrame') showFailure(new MoodleAuthError('blocked'),'URL_REJECTED',details.url); }
      });
      isolated.webRequest.onBeforeRedirect(details => { callback(details.redirectURL,'redirect'); });
      window.webContents.on('will-navigate',navigate);
      window.webContents.on('will-redirect',navigate);
      window.webContents.on('will-frame-navigate',event => navigate(event,event.url));
      window.webContents.on('did-fail-load',(_event,code,description,target,isMainFrame) => {
        if (!isMainFrame || settled || callback(target,'failed-navigation') || code === -3 || target === recoveryUrl) return;
        showFailure(new MoodleAuthError('load-failed'),description || String(code),target);
      });
      window.on('closed',() => finish({kind:'error',error:this.disposed ? new MoodleAuthError('disposed') : failure ?? new MoodleAuthError('cancelled')}));
      load();
    });
  }
  dispose() { this.disposed = true; for (const window of this.windows) window.destroy(); this.windows.clear(); }
}
