import { verifyCallback } from './callback';
import { randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { z } from 'zod';
import type { MoodleSchool } from '../../shared/moodle';
import { MoodleError, publicConfigSchema, type Fetch } from './client';
import { allowsLoginNavigation } from './schools';


export class MoodleSso {
  private readonly windows = new Set<BrowserWindow>();
  private disposed = false;
  constructor(private readonly request: Fetch = fetch) {}
  async login<T>(school: MoodleSchool, accept: (token: string) => Promise<T>): Promise<T> {
    let providerId: string;
    try {
      const response = await this.request(`${school.host}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config&lang=en`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{index:0,methodname:'tool_mobile_get_public_config',args:{}}]),redirect:'error',signal:AbortSignal.timeout(30_000)});
      if (!response.ok) throw new MoodleError('service');
      const envelopes = z.array(z.object({error:z.literal(false),data:publicConfigSchema})).parse(await response.json());
      const provider = envelopes[0]?.data.identityproviders[0];
      providerId = provider ? new URL(provider.url).searchParams.get('id') ?? '' : '';
      if (!/^\d+$/.test(providerId)) throw new MoodleError('service');
    } catch { throw new MoodleError('service'); }
    if (this.disposed) throw new Error('Moodle login closed');
    const passport = randomBytes(32).toString('hex');
    const launch = new URL(`${school.host}/admin/tool/mobile/launch.php`);
    launch.search = new URLSearchParams({service:'moodle_mobile_app',passport,urlscheme:'vstudymoodle',oauthsso:providerId}).toString();
    const isolated = session.fromPartition(`moodle-${randomBytes(16).toString('hex')}`);
    isolated.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    const window = new BrowserWindow({width:600,height:760,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}});
    this.windows.add(window);
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-attach-webview',event => event.preventDefault());
    return new Promise<T>((resolve,reject) => {
      let settled = false;
      const finish = async (token?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.windows.delete(window);
        try {
          if (!token) throw new Error('Moodle login cancelled or invalid');
          resolve(await accept(token));
        } catch { reject(new Error('Moodle login cancelled or invalid')); }
        finally {
          if (!window.isDestroyed()) window.destroy();
          void isolated.clearStorageData().catch(() => undefined);
        }
      };
      const timer = setTimeout(() => { void finish(); },10 * 60_000);
      const navigate = (event: Electron.Event, target: string) => {
        if (target.startsWith('vstudymoodle:')) {
          event.preventDefault();
          try { void finish(verifyCallback(target,school.host,passport)); } catch { void finish(); }
        } else if (!allowsLoginNavigation(school,target)) event.preventDefault();
      };
      window.webContents.on('will-navigate',navigate);
      window.webContents.on('will-redirect',navigate);
      window.webContents.on('will-frame-navigate', (event) => navigate(event,event.url));
      window.on('closed',() => { void finish(); });
      void window.loadURL(launch.href).catch(() => { void finish(); });
    });
  }
  dispose() { this.disposed = true; for (const window of this.windows) window.destroy(); this.windows.clear(); }
}
