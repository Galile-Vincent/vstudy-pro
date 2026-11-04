import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MoodleSso } from './sso';
import { checkSite } from './discovery';

const mock = vi.hoisted(() => ({windows:[] as {options:unknown;url:string;destroyed:boolean;emit:(name:string,...args:unknown[]) => boolean;webContents:{emit:(name:string,...args:unknown[]) => boolean;setWindowOpenHandler:ReturnType<typeof vi.fn>}}[],partitions:[] as string[],clear:vi.fn(async () => undefined),permission:vi.fn()}));
vi.mock('electron',async () => {
  const {EventEmitter} = await import('node:events');
  return {
    session:{fromPartition:(partition:string) => {mock.partitions.push(partition);return {clearStorageData:mock.clear,setPermissionRequestHandler:mock.permission,setPermissionCheckHandler:vi.fn(),setProxy:vi.fn(async () => undefined),webRequest:{onBeforeRequest:vi.fn()}};}},
    BrowserWindow:class extends EventEmitter {
      url = ''; destroyed = false;
      webContents = Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn()});
      constructor(readonly options:unknown) { super(); mock.windows.push(this); }
      isDestroyed() {return this.destroyed;}
      destroy() {this.destroyed = true;this.emit('closed');}
      async loadURL(url:string) {this.url = url;}
    },
  };
});
it('uses an isolated sandbox and saves the verified callback before closing',async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json([{error:false,data:{typeoflogin:2,identityproviders:[{url:'https://ilearning.cycu.edu.tw/auth/oauth2/login.php?id=3'}]}}]));
  const sso = new MoodleSso();
  let saved!: () => void;
  const accept = vi.fn(async () => {await new Promise<void>(resolve => {saved = resolve;});return {connected:true};});
  const pending = sso.login(await checkSite('https://ilearning.cycu.edu.tw',request),0,accept);
  await vi.waitFor(() => expect(mock.windows.at(-1)?.url).toContain('launch.php'));
  const window = mock.windows.at(-1)!;
  expect(window.options).toMatchObject({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false}});
  expect(mock.partitions.at(-1)).toMatch(/^moodle-/);
  expect(mock.partitions.at(-1)).not.toContain('persist:');
  expect(window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({action:'deny'});
  const launch = new URL(window.url);
  expect(launch.searchParams.get('oauthsso')).toBe('3');
  expect(launch.searchParams.get('urlscheme')).toBe('vstudymoodle');
  const blocked = {preventDefault:vi.fn()};
  window.webContents.emit('will-navigate',blocked,'https://127.0.0.1');
  expect(blocked.preventDefault).toHaveBeenCalledOnce();
  const signature = createHash('md5').update('https://ilearning.cycu.edu.tw' + launch.searchParams.get('passport')).digest('hex');
  const callback = 'vstudymoodle://token=' + Buffer.from(`${signature}:::private-token`).toString('base64');
  const event = {preventDefault:vi.fn()};
  window.webContents.emit('will-redirect',event,callback);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(accept).toHaveBeenCalledExactlyOnceWith({token:'private-token'});
  expect(window.destroyed).toBe(true);
  saved();
  expect(await pending).toEqual({connected:true});
  expect(window.destroyed).toBe(true);
  expect(mock.clear).toHaveBeenCalled();
  sso.dispose();
});
