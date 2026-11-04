import { verifyCallback } from './callback';
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import type { CheckedSite } from './discovery';
import { networkUrl, siteTarget } from './site-url';
import { loginProxy } from './login-proxy';
import { MoodleAuthError, type MoodleTokens } from './auth';

export class MoodleSso {
  private readonly windows = new Set<BrowserWindow>();
  private disposed = false;
  async login<T>(site: CheckedSite, providerIndex: number | undefined, accept: (tokens: MoodleTokens) => Promise<T>): Promise<T> {
    if (site.authPlan.kind !== 'browser' && site.authPlan.kind !== 'embedded') throw new MoodleAuthError('requirecorrectaccess');
    const provider = providerIndex === undefined ? undefined : site.authPlan.providers[providerIndex];
    if (providerIndex !== undefined && !provider) throw new MoodleAuthError('requirecorrectaccess');
    const passport = randomBytes(32).toString('hex');
    const launch = siteTarget(site.siteUrl,site.config.launchurl || `${site.siteUrl}/admin/tool/mobile/launch.php`);
    launch.search = new URLSearchParams({service:'moodle_mobile_app',passport,urlscheme:'vstudymoodle'}).toString();
    if (provider) {
      const id = new URL(provider.url).searchParams.get('id');
      if (id && /^\d+$/.test(id)) launch.searchParams.set('oauthsso',id);
    }
    if (this.disposed) throw new MoodleAuthError('cancelled');
    const proxy = await loginProxy();
    const isolated = session.fromPartition(`moodle-${randomBytes(16).toString('hex')}`);
    await isolated.setProxy({mode:'fixed_servers',proxyRules:`http=127.0.0.1:${proxy.port};https=127.0.0.1:${proxy.port}`,proxyBypassRules:'<-loopback>'});
    isolated.webRequest.onBeforeRequest((details,callback) => {
      try { networkUrl(details.url); callback({cancel:false}); } catch { callback({cancel:true}); }
    });
    isolated.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    const window = new BrowserWindow({width:600,height:760,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}});
    this.windows.add(window);
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-attach-webview',event => event.preventDefault());
    return new Promise<T>((resolve,reject) => {
      let settled = false;
      const finish = (tokens?: MoodleTokens) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.windows.delete(window);
        if (!window.isDestroyed()) window.destroy();
        proxy.close();
        void isolated.clearStorageData().catch(() => undefined);
        if (!tokens) { reject(new MoodleAuthError('cancelled')); return; }
        void accept(tokens).then(resolve,reject);
      };
      const timer = setTimeout(() => finish(),10 * 60_000);
      const navigate = (event: Electron.Event, target: string) => {
        if (target.startsWith('vstudymoodle:')) {
          event.preventDefault();
          try { finish(verifyCallback(target,site.siteUrl,passport)); } catch { finish(); }
        } else {
          try { networkUrl(target); } catch { event.preventDefault(); }
        }
      };
      window.webContents.on('will-navigate',navigate);
      window.webContents.on('will-redirect',navigate);
      window.webContents.on('will-frame-navigate',event => navigate(event,event.url));
      window.on('closed',() => finish());
      void window.loadURL(launch.href).catch(() => finish());
    });
  }
  dispose() { this.disposed = true; for (const window of this.windows) window.destroy(); this.windows.clear(); }
}
