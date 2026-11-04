import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MoodleSso } from './sso';
import { checkSite } from './discovery';

const mock = vi.hoisted(() => ({windows:[] as {options:unknown;url:string;destroyed:boolean;destroy:() => void;emit:(name:string,...args:unknown[]) => boolean;webContents:{getURL:() => string;emit:(name:string,...args:unknown[]) => boolean;setWindowOpenHandler:ReturnType<typeof vi.fn>}}[],partitions:[] as string[],clear:vi.fn(async () => undefined),permission:vi.fn(),request:vi.fn(),redirect:vi.fn(),external:false,open:vi.fn<(url:string) => Promise<void>>(async () => undefined),callbacks:new Set<(url:string) => boolean>(),loadError:undefined as string | undefined}));
vi.mock('./sso-protocol',() => ({ssoProtocol:{get available() {return mock.external;},open:mock.open,subscribe:(callback:(url:string) => boolean) => {mock.callbacks.add(callback);return () => mock.callbacks.delete(callback);}}}));
vi.mock('electron',async () => {
  const {EventEmitter} = await import('node:events');
  return {
    session:{fromPartition:(partition:string) => {mock.partitions.push(partition);return {clearStorageData:mock.clear,setPermissionRequestHandler:mock.permission,setPermissionCheckHandler:vi.fn(),setProxy:vi.fn(async () => undefined),webRequest:{onBeforeRequest:mock.request,onBeforeRedirect:mock.redirect}};}},
    BrowserWindow:class extends EventEmitter {
      url = ''; destroyed = false;
      webContents = Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),getURL:()=>this.url});
      constructor(readonly options:unknown) { super(); mock.windows.push(this); }
      isDestroyed() {return this.destroyed;}
      destroy() {this.destroyed = true;this.emit('closed');}
      async loadURL(url:string) {this.url = url;if(mock.loadError && url.startsWith('https:')) {const code=mock.loadError;mock.loadError=undefined;throw Object.assign(new Error('network'),{code});}}
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
  const signature = createHash('md5').update('https://ilearning.cycu.edu.tw' + launch.searchParams.get('passport')).digest('hex');
  const callback = 'vstudymoodle://token=' + Buffer.from(`${signature}:::private-token:::private-secret`).toString('base64');
  const event = {preventDefault:vi.fn()};
  window.webContents.emit('will-redirect',event,callback,false,true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(accept).toHaveBeenCalledExactlyOnceWith({token:'private-token',privateToken:'private-secret'}));
  expect(window.destroyed).toBe(true);
  window.webContents.emit('will-redirect',event,callback,false,true);
  expect(accept.mock.calls).toEqual([[{token:'private-token',privateToken:'private-secret'}]]);
  saved();
  expect(await pending).toEqual({connected:true});
  expect(window.destroyed).toBe(true);
  expect(mock.clear).toHaveBeenCalled();
  sso.dispose();
});

it('closes a cancelled login without accepting a token',async () => {
  const site = await checkSite('https://school.example',async () => Response.json([{error:false,data:{typeoflogin:3,launchurl:'https://login.school.example/launch.php'}}]));
  const sso = new MoodleSso(), accept = vi.fn(async () => 'connected');
  const pending = sso.login(site,undefined,accept);
  const rejected = expect(pending).rejects.toMatchObject({code:'cancelled'});
  await vi.waitFor(() => expect(mock.windows.at(-1)?.url).toContain('https://login.school.example/launch.php'));
  const window = mock.windows.at(-1)!;
  expect(new URL(window.url).searchParams.get('service')).toBe('moodle_mobile_app');
  window.destroy();await rejected;
  expect(accept.mock.calls).toEqual([]);expect(window.destroyed).toBe(true);sso.dispose();
});

async function start() {
  const sso = new MoodleSso();
  const site = await checkSite('https://school.example',async () => Response.json([{error:false,data:{typeoflogin:2}}]));
  const accept = vi.fn(async () => 'connected');
  const count = mock.windows.length;
  const pending = sso.login(site,undefined,accept);
  const result = pending.then(value => ({value}),error => ({error}));
  await vi.waitFor(() => {expect(mock.windows.length).toBe(count + 1); expect(mock.windows.at(-1)?.url).toContain('https://school.example/admin');});
  return {sso,window:mock.windows.at(-1)!,result,accept};
}
it.each(['navigate','redirect','did-fail-load'])('captures a callback at %s',async phase => {
  const {sso,window,result,accept} = await start();
  const passport = new URL(window.url).searchParams.get('passport');
  const signature = createHash('md5').update('https://school.example' + passport).digest('hex');
  const target = 'vstudymoodle://token=' + Buffer.from(`${signature}:::access`).toString('base64');
  if (phase === 'navigate') window.webContents.emit('will-navigate',{preventDefault:vi.fn()},target);
  else if (phase === 'redirect') window.webContents.emit('will-redirect',{preventDefault:vi.fn()},target,false,true);
  else window.webContents.emit('did-fail-load',{},-302,'ERR_UNKNOWN_URL_SCHEME',target,true);
  expect(await result).toEqual({value:'connected'});
  expect(accept).toHaveBeenCalledWith({token:'access'});
  sso.dispose();
});
it.each(['malformed','signature-mismatch'])('distinguishes callback %s',async reason => {
  const {sso,window,result} = await start();
  const target = reason === 'malformed' ? 'vstudymoodle://bad' : 'vstudymoodle://token=' + Buffer.from(`${'0'.repeat(32)}:::access`).toString('base64');
  window.webContents.emit('will-redirect',{preventDefault:vi.fn()},target,false,true);
  expect(await result).toMatchObject({error:{code:'callback-invalid',reason}});
  sso.dispose();
});
it('keeps a failed page open with Retry and reports load failure on close',async () => {
  const {sso,window,result} = await start();
  window.webContents.emit('did-fail-load',{},-130,'ERR_PROXY_CONNECTION_FAILED','https://school.example/?secret=hidden',true);
  expect(window.destroyed).toBe(false);
  expect(decodeURIComponent(window.url)).toContain('Retry');
  window.destroy();
  expect(await result).toMatchObject({error:{code:'load-failed'}});
  sso.dispose();
});
it('reports a guard block separately from a cancellation',async () => {
  const {sso,window,result} = await start();
  window.webContents.emit('will-navigate',{preventDefault:vi.fn()},'http://unsafe.example/path?secret=hidden');
  expect(window.destroyed).toBe(false);
  window.destroy();
  expect(await result).toMatchObject({error:{code:'blocked'}});
  sso.dispose();
});
it('reports disposal separately',async () => {
  const {sso,result} = await start();
  sso.dispose();
  expect(await result).toMatchObject({error:{code:'disposed'}});
});
it('reports timeout separately',async () => {
  let expire: (() => void) | undefined;
  const original = globalThis.setTimeout;
  const timer = vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 600_000) expire = callback;
    return original(callback,delay);
  }) as typeof setTimeout);
  try {
    const {sso,result} = await start();
    expect(expire).toBeDefined(); expire!();
    expect(await result).toMatchObject({error:{code:'timeout'}});
    sso.dispose();
  } finally {timer.mockRestore();}
});

it('keeps the first window open when loadURL rejects',async () => {
  mock.loadError = 'ERR_TUNNEL_CONNECTION_FAILED';
  const sso = new MoodleSso();
  const site = await checkSite('https://school.example',async () => Response.json([{error:false,data:{typeoflogin:2}}]));
  const count = mock.windows.length;
  const result = sso.login(site,undefined,async () => 'connected').catch(error => error);
  await vi.waitFor(() => {expect(mock.windows.length).toBe(count+1);expect(mock.windows.at(-1)!.url).toMatch(/^data:/);});
  const window = mock.windows.at(-1)!;
  expect(window.destroyed).toBe(false);
  expect(decodeURIComponent(window.url)).toContain('Retry');
  window.destroy();
  expect(await result).toMatchObject({code:'load-failed'});
  sso.dispose();
});

it.each(['about:blank','about:srcdoc','data:text/html,frame','blob:https://school.example/id','javascript:void(0)','https://secondary.example/frame'])('allows subframe %s without replacing the document',async url => {
  const {sso,window,result} = await start();
  const initial = window.url;
  const event = {url,isMainFrame:false,preventDefault:vi.fn()};
  window.webContents.emit('will-frame-navigate',event);
  window.webContents.emit('will-redirect',event,url,false,false);
  window.webContents.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED',url,false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(window.url).toBe(initial);
  sso.dispose();await result;
});
it('allows HTTPS navigation without installing a proxy or per-request guard',async () => {
  const {sso,window,result} = await start();
  const event = {preventDefault:vi.fn()};
  window.webContents.emit('will-navigate',event,'https://identity.example:8443/login');
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();expect(mock.redirect).not.toHaveBeenCalled();
  sso.dispose();await result;
});
it('shows host and reason without query secrets and allows its own recovery page',async () => {
  const {sso,window,result} = await start();
  window.webContents.emit('will-navigate',{preventDefault:vi.fn()},'http://unsafe.example/?secret=hidden');
  const page = decodeURIComponent(window.url);
  expect(page).toContain('unsafe.example · SCHEME_REJECTED');expect(page).not.toContain('hidden');
  const event = {preventDefault:vi.fn()};
  window.webContents.emit('will-navigate',event,window.url);
  expect(event.preventDefault).not.toHaveBeenCalled();
  sso.dispose();await result;
});
it('reports DNS failure as load failure with its code',async () => {
  const {sso,window,result} = await start();
  window.webContents.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://school.example/?secret=hidden',true);
  expect(decodeURIComponent(window.url)).toContain('school.example · ERR_NAME_NOT_RESOLVED');
  window.destroy();expect(await result).toMatchObject({error:{code:'load-failed'}});sso.dispose();
});
it('routes external callbacks by passport once and supports cancellation',async () => {
  mock.external = true;
  try {
    const sso = new MoodleSso();
    const site = await checkSite('https://external.example',async () => Response.json([{error:false,data:{typeoflogin:2}}]));
    const accept = vi.fn(async () => 'connected');
    const count = mock.windows.length;
    const pending = sso.login(site,undefined,accept);
    expect(sso.state(site.siteUrl)).toBe('external');expect(mock.windows.length).toBe(count);
    const passport = new URL(mock.open.mock.calls.at(-1)![0]).searchParams.get('passport');
    const wrong = 'vstudymoodle://token=' + Buffer.from(`${'0'.repeat(32)}:::bad`).toString('base64');
    expect([...mock.callbacks][0]!(wrong)).toBe(false);expect(accept).not.toHaveBeenCalled();
    const signature = createHash('md5').update(site.siteUrl + passport).digest('hex');
    const target = 'vstudymoodle://token=' + Buffer.from(`${signature}:::access:::private`).toString('base64');
    const receive = [...mock.callbacks][0]!;
    expect(receive(target)).toBe(true);receive(target);
    expect(await pending).toBe('connected');expect(accept).toHaveBeenCalledExactlyOnceWith({token:'access',privateToken:'private'});
    expect(mock.callbacks.size).toBe(0);expect(sso.state(site.siteUrl)).toBe(null);
    const cancelled = sso.login(site,undefined,accept).catch(error => error);
    sso.cancel(site.siteUrl);expect(await cancelled).toMatchObject({code:'cancelled'});sso.dispose();
  } finally {mock.external = false;}
});
it('uses embedded login for typeoflogin 3 even when external routing is available',async () => {
  mock.external = true;
  try {
    const sso = new MoodleSso();
    const site = await checkSite('https://embedded.example',async () => Response.json([{error:false,data:{typeoflogin:3}}]));
    const pending = sso.login(site,undefined,async () => 'connected').catch(error => error);
    expect(sso.state(site.siteUrl)).toBe('embedded');sso.dispose();expect(await pending).toMatchObject({code:'disposed'});
  } finally {mock.external = false;}
});
it.each(['data:text/html,document','blob:https://school.example/id','javascript:void(0)','file:///tmp/document'])('blocks top-level scheme %s',async url => {
  const {sso,window,result} = await start();
  const event = {url,isMainFrame:true,preventDefault:vi.fn()};
  window.webContents.emit('will-frame-navigate',event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(decodeURIComponent(window.url)).toContain('SCHEME_REJECTED');
  window.destroy();expect(await result).toMatchObject({error:{code:'blocked'}});sso.dispose();
});
it('denies browser permission requests without a preload',async () => {
  const {sso,window,result} = await start();
  const respond = vi.fn();
  mock.permission.mock.calls.at(-1)![0]({},'camera',respond);
  expect(respond).toHaveBeenCalledExactlyOnceWith(false);
  expect(window.options).toMatchObject({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  expect((window.options as {webPreferences:object}).webPreferences).not.toHaveProperty('preload');
  sso.dispose();await result;
});

it('allows the internal blank document without recovery',async () => {
  const {sso,window,result} = await start();
  const event = {url:'about:blank',isMainFrame:true,preventDefault:vi.fn()};
  window.webContents.emit('will-frame-navigate',event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(window.url).toMatch(/^https:/);
  sso.dispose();await result;
});
