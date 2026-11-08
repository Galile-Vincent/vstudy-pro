/**
 * Regression coverage for page-initiated imports in Moodle content views.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  panes: [] as { visible:boolean; contents: import('node:events').EventEmitter & { openHandler?: (details: { url: string }) => unknown; loadURL: ReturnType<typeof vi.fn> } }[],
  browsers: [] as (import('node:events').EventEmitter & { clearStorageData: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn>; closeAllConnections: ReturnType<typeof vi.fn> })[],
  imports: vi.fn(async () => '5f0a7a2e-8d4b-4c63-9f0e-1b2c3d4e5f60'),
  log: vi.fn(),
}));
vi.mock('../logging', () => ({ log: mock.log }));
vi.mock('./webview-transport', () => ({ exchangeWebviewCookie: vi.fn(async () => undefined), probeWebviewSession: vi.fn(async () => true) }));
vi.mock('./webview-files', () => ({ importWebviewFile: () => mock.imports() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Contents extends EventEmitter {
    openHandler?: (details: { url: string }) => unknown;
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    setWindowOpenHandler(handler: (details: { url: string }) => unknown) { this.openHandler = handler; }
    setZoomFactor = vi.fn();
    loadURL = vi.fn(async () => undefined); stop = vi.fn(); focus = vi.fn(); close = vi.fn(); isDestroyed() { return false; }
  }
  class WebContentsView {
    webContents = new Contents();
    constructor() { mock.panes.push({ contents: this.webContents,visible:false }); }
    setVisible = vi.fn((visible:boolean)=>{mock.panes.find(pane=>pane.contents===this.webContents)!.visible=visible;}); setBounds = vi.fn(); setBackgroundColor = vi.fn();
  }
  const window = { contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, isDestroyed: () => false, getContentSize: () => [800, 600] };
  return {
    BrowserWindow: { fromWebContents: () => window },
    WebContentsView,
    session: { fromPartition: () => {
      const browser = Object.assign(new EventEmitter(), {
        setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn(), onBeforeSendHeaders: vi.fn() },
        cookies: { get: vi.fn(async () => [{ name: 'MoodleSession', value: 'cookie' }]) },
        clearStorageData: vi.fn(async () => undefined), clearCache: vi.fn(async () => undefined), closeAllConnections: vi.fn(async () => undefined),
        fetch: vi.fn(),
      });
      mock.browsers.push(browser); return browser;
    } },
    clipboard: { writeText: vi.fn() }, shell: { openExternal: vi.fn() }, dialog: { showMessageBox: vi.fn() },
  };
});
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { MoodleWebviews } from './webview';

const accountId = '8b7f7a4e-3c1a-4a52-9a37-0f6d0c7e3a11', site = 'https://school.example';
const file = (name = 'a.pdf') => `${site}/pluginfile.php/1/mod_resource/content/0/${name}`;
const account = { status: 'connected', id: accountId, siteUrl: site, siteName: 'School', remoteUserId: 7 };
const users: MoodleWebviews[] = [];
async function open(tabId=randomUUID()) {
  const owner = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false, focus: vi.fn(), getZoomFactor: () => 1 }) as unknown as WebContents;
  const views = new MoodleWebviews({ request: async () => new Response(JSON.stringify({key:'autologin-test-key'})), account: () => account as never, credentials: async () => ({ token: 't', privateToken: 'p' }), file: () => ({ account: account as never, url: file() }), documents: { importPath: vi.fn() } as never });
  users.push(views);
  const state = views.open(owner, accountId, { kind: 'page', url: `${site}/course/view.php?id=2` },tabId);
  await vi.waitFor(() => expect(mock.panes.at(-1)!.contents.loadURL).toHaveBeenCalled());
  vi.setSystemTime(1_000_000);
  const { contents } = mock.panes.at(-1)!;
  return { tabId, views, owner, state, contents, browser: mock.browsers.at(-1)! };
}
const settle = async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve(); };
const click = (contents: EventEmitter) => contents.emit('before-mouse-event', { preventDefault: vi.fn() }, { type: 'mouseDown', button: 'left' });
function navigate(contents: EventEmitter, url: string) {
  const event = { preventDefault: vi.fn() };
  contents.emit('will-navigate', event, url);
  return event;
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1_000_000); mock.panes.length = 0; mock.browsers.length = 0; mock.imports.mockClear(); mock.log.mockClear(); });
afterEach(async () => { for (const views of users.splice(0)) await views.dispose(); vi.useRealTimers(); });

it('does not import a pluginfile navigation that no user input caused', async () => {
  const { contents, state, views, owner } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  const event = navigate(contents, file());
  await settle();
  expect(event.preventDefault).toHaveBeenCalled();
  expect(mock.imports).not.toHaveBeenCalled();
  expect(views.state(owner, state.id)).toMatchObject({ status: 'error', error: 'blocked', documentId: null });
  expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ phase: 'moodle-webview-import-refused', reason: 'no-gesture' }));
});

it('imports a pluginfile navigation that follows a click and spends that click once', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  click(contents); navigate(contents, file()); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
  navigate(contents, file('b.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('treats a keypress as a gesture and lets it expire after ten seconds', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  contents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'Enter' });
  vi.setSystemTime(1_000_000 + 60_000 + 10_001);
  navigate(contents, file()); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  contents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'Enter' });
  vi.setSystemTime(1_000_000 + 60_000 + 20_000);
  navigate(contents, file()); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('gates popups on the same gesture', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  expect(contents.openHandler!({ url: file() })).toEqual({ action: 'deny' }); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  click(contents);
  expect(contents.openHandler!({ url: file() })).toEqual({ action: 'deny' }); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('cancels scripted downloads and accepts only downloads the browser tied to a gesture', async () => {
  const { contents, browser } = await open();
  const download = (gesture: boolean) => {
    const event = { preventDefault: vi.fn() };
    browser.emit('will-download', event, { getURL: () => file(), hasUserGesture: () => gesture }, contents);
    return event;
  };
  expect(download(false).preventDefault).toHaveBeenCalled(); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  click(contents);
  expect(download(true).preventDefault).toHaveBeenCalled(); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('keeps the file the user opened from the app importable without a page gesture', async () => {
  const owner = Object.assign(new EventEmitter(), { id: 2, isDestroyed: () => false, focus: vi.fn(), getZoomFactor: () => 1 }) as unknown as WebContents;
  const views = new MoodleWebviews({ request: async () => new Response(JSON.stringify({key:'autologin-test-key'})), account: () => account as never, credentials: async () => ({ token: 't', privateToken: 'p' }), file: () => ({ account: account as never, url: file() }), documents: { importPath: vi.fn() } as never });
  users.push(views);
  views.open(owner, accountId, { kind: 'file', fileId: '1c9b5f0e-0f84-4d4e-8f44-3c1d2a5b6e70' });
  await vi.waitFor(() => expect(mock.imports).toHaveBeenCalledTimes(1));
});

it('refuses the sixth import in a minute with a blocked notice and allows imports again afterwards', async () => {
  const { contents, views, owner, state } = await open(), start = Date.now();
  for (let count = 1; count <= 5; count++) { click(contents); navigate(contents, file(`${count}.pdf`)); await settle(); }
  expect(mock.imports).toHaveBeenCalledTimes(5);
  click(contents); navigate(contents, file('6.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(5);
  expect(views.state(owner, state.id)).toMatchObject({ status: 'error', error: 'blocked' });
  expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ phase: 'moodle-webview-import-refused', reason: 'rate-limit' }));
  vi.setSystemTime(start + 60_001);
  click(contents); navigate(contents, file('7.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(6);
});

it('clears the account partition storage on disconnect', async () => {
  const { views, browser } = await open();
  await views.disconnect(accountId);
  expect(browser.clearStorageData).toHaveBeenCalled();
  expect(browser.clearCache).toHaveBeenCalled();
  expect(browser.closeAllConnections).toHaveBeenCalled();
});

it('R2 one click cannot authorize a download and then another navigation import', async () => {
 const { contents, browser } = await open();
 click(contents);
 browser.emit('will-download', {preventDefault:vi.fn()}, {getURL:()=>file('download.pdf'),hasUserGesture:()=>true}, contents);
 await settle();
 navigate(contents,file('second.pdf')); await settle();
 console.log('R2: physical clicks=1, imports='+mock.imports.mock.calls.length);
 expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('imports an app-opened file after slow authentication',async()=>{
 const {views,owner,browser}=await open();let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const cookies=(browser as unknown as {cookies:{get:ReturnType<typeof vi.fn>}}).cookies;
 cookies.get.mockImplementationOnce(async()=>{await gate;return [{name:'MoodleSession',value:'cookie'}];});
 views.open(owner,accountId,{kind:'file',fileId:'1c9b5f0e-0f84-4d4e-8f44-3c1d2a5b6e70'});
 await settle();vi.setSystemTime(Date.now()+11_000);release();
 await vi.waitFor(()=>expect(mock.imports).toHaveBeenCalledTimes(1));
});

const download = (browser: EventEmitter, contents: EventEmitter, name: string, gesture = true) =>
  browser.emit('will-download', { preventDefault: vi.fn() }, { getURL: () => file(name), hasUserGesture: () => gesture }, contents);

it('spends one click across navigation and a subsequent download', async () => {
  const { contents, browser } = await open();
  click(contents);
  navigate(contents, file('a.pdf')); await settle();
  download(browser, contents, 'b.pdf'); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});
it('spends one click across two browser-reported user downloads', async () => {
  const { contents, browser } = await open();
  click(contents);
  download(browser, contents, 'a.pdf'); await settle();
  download(browser, contents, 'b.pdf'); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});
it('does not authorize a scripted file import after page reload', async () => {
  const { contents, views, owner, state } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  await views.action(owner, state.id, 'reload'); await settle();
  navigate(contents, file('evil.pdf')); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
});
it('does not authorize a scripted file import after page reconnect', async () => {
  const { contents, views, owner, state } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  await views.action(owner, state.id, 'reconnect'); await settle();
  navigate(contents, file('evil.pdf')); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
});

it.each(['reload', 'reconnect'] as const)('imports an app file again on %s without leaving page authorization', async action => {
  const {views,owner,contents}=await open();
  const state=views.open(owner,accountId,{kind:'file',fileId:'1c9b5f0e-0f84-4d4e-8f44-3c1d2a5b6e70'});
  await vi.waitFor(()=>expect(mock.imports).toHaveBeenCalledTimes(1));
  await views.action(owner,state.id,action);
  await vi.waitFor(()=>expect(mock.imports).toHaveBeenCalledTimes(2));
  navigate(mock.panes.at(-1)!.contents,file('scripted.pdf'));await settle();
  expect(mock.imports).toHaveBeenCalledTimes(2);
  expect(contents.loadURL).toHaveBeenCalledTimes(1);
});
it('requires a click even if Chromium reports a user download', async () => {
  const {contents,browser}=await open();
  download(browser,contents,'scripted.pdf');await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  click(contents);download(browser,contents,'clicked.pdf');await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});
it('uses local gesture tracking when the browser has no gesture API', async () => {
  const {contents,browser}=await open();
  click(contents);
  browser.emit('will-download',{preventDefault:vi.fn()},{getURL:()=>file()},contents);
  await settle();expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('ensures a tab idempotently while isolating sibling tabs and owners', async () => {
  const {views,owner,state}=await open();
  const tab='12345678-1234-4234-a234-123456789012';
  const first=views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=3'},tab);
  expect(views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=3'},tab).id).toBe(first.id);
  expect(first.id).not.toBe(state.id);
  const stranger=Object.assign(new EventEmitter(),{id:2}) as unknown as WebContents;
  expect(()=>views.state(stranger,first.id)).toThrow('Unknown Moodle pane');
  views.sync(owner,[tab]);
  expect(()=>views.state(owner,state.id)).toThrow();
  expect(views.state(owner,first.id).id).toBe(first.id);
});
it('discards a crashed view and recreates it on the next ensure',async()=>{
  const {views,owner,state,contents,tabId}=await open();
  contents.emit('render-process-gone');
  expect(()=>views.state(owner,state.id)).toThrow();
  const next=views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=2'},tabId);
  expect(next.id).not.toBe(state.id);
});
it('disconnect destroys every resource for the account',async()=>{
  const {views,owner,state}=await open();
  const second=views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=3'});
  await views.disconnect(accountId);
  expect(views.state(owner,state.id)).toMatchObject({status:'error',error:'session-expired'});
  expect(views.state(owner,second.id)).toMatchObject({status:'error',error:'session-expired'});
});
it('schedules one account keepalive across sibling views',async()=>{
  const timer=vi.spyOn(globalThis,'setInterval');
  try {
    const {views,owner}=await open();
    views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=3'});
    expect(timer.mock.calls.filter(([,delay])=>delay===4*60_000)).toHaveLength(1);
  } finally {timer.mockRestore();}
});

it('replaces a tab when its requested Moodle target changes',async()=>{
 const {views,owner,tabId,state}=await open();
 const next=views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=99'},tabId);
 expect(next.id).not.toBe(state.id);
 await vi.waitFor(()=>expect(mock.panes.at(-1)!.contents.loadURL).toHaveBeenCalledWith(site+'/course/view.php?id=99'));
});
it('delivers an imported document until acknowledgement across reopening',async()=>{
 const {views,owner,tabId,contents}=await open();
 click(contents);navigate(contents,file());await settle();
 const first=views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=2'},tabId);
 expect(first.documentId).not.toBeNull();
 await views.action(owner,first.id,'ack-document');
 expect(views.state(owner,first.id).documentId).toBeNull();
});
it('reloads the private committed URL while exposing only its public copy',async()=>{
 const {views,owner,state,contents}=await open();
 const url=site+'/course/view.php?id=2&return=lesson';contents.emit('did-navigate',{},url);
 expect(views.state(owner,state.id).url).not.toContain('return');
 await views.action(owner,state.id,'reload');await settle();
 expect(contents.loadURL).toHaveBeenLastCalledWith(url);
});
it('keeps owner cleanup after discard until the owner is destroyed',async()=>{
 const {views,owner,contents,tabId}=await open();
 contents.emit('render-process-gone');owner.emit('destroyed');
 expect(views.sync(owner,[tabId])).toEqual([]);
});
it('stops account keepalive when its last view closes and restarts it on ensure',async()=>{
 const clear=vi.spyOn(globalThis,'clearInterval');
 const {views,owner,state}=await open();
 await views.action(owner,state.id,'close');expect(clear).toHaveBeenCalled();
 const interval=vi.spyOn(globalThis,'setInterval');
 views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=2'});
 expect(interval).toHaveBeenCalledWith(expect.any(Function),240000);
 clear.mockRestore();interval.mockRestore();
});
it('silently reauthenticates after a failed keepalive probe',async()=>{
 const {probeWebviewSession,exchangeWebviewCookie}=await import('./webview-transport');
 const {views,owner,state,contents}=await open();contents.emit('did-finish-load');
 vi.mocked(probeWebviewSession).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 vi.mocked(exchangeWebviewCookie).mockClear();vi.setSystemTime(Date.now()+7*60000);
 views.layout(owner,state.id,{x:0,y:0,width:500,height:500},{dark:false,background:'#ffffff',foreground:'#000000',accent:'#0000ff'},true,state.generation);
 await vi.waitFor(()=>expect(exchangeWebviewCookie).toHaveBeenCalledOnce());
 expect(views.state(owner,state.id).error).toBeNull();
});
it('does not replay an app file import after discard',async()=>{
 const {views,owner}=await open();const tab=randomUUID();const target={kind:'file' as const,fileId:randomUUID()};
 const first=views.open(owner,accountId,target,tab);await vi.waitFor(()=>expect(mock.imports).toHaveBeenCalledTimes(1));
 views.state(owner,first.id);mock.panes.at(-1)!.contents.emit('render-process-gone');
 views.open(owner,accountId,target,tab);await settle();
 expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('ignores a renderer checkpoint for another requested target',async()=>{
 const {views,owner,tabId}=await open();
 views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=99'},tabId,{accountId,requestedUrl:site+'/course/view.php?id=2',url:site+'/course/view.php?id=2',zoom:1,scrollTop:0});
 await vi.waitFor(()=>expect(mock.panes.at(-1)!.contents.loadURL).toHaveBeenCalledWith(site+'/course/view.php?id=99'));
});
it('retains import delivery across reads and actions until acknowledged',async()=>{
 const {views,owner,contents,state}=await open();click(contents);navigate(contents,file());await settle();
 const id=views.state(owner,state.id).documentId;expect(id).not.toBeNull();
 expect((await views.action(owner,state.id,'copy')).documentId).toBe(id);
 expect(views.state(owner,state.id).documentId).toBe(id);
 await views.action(owner,state.id,'ack-document');expect(views.state(owner,state.id).documentId).toBeNull();
});
it('keeps dirty protection through same-document navigation',async()=>{
 const {views,owner,contents,state,tabId}=await open();contents.emit('did-finish-load');
 contents.emit('before-input-event',{preventDefault:vi.fn()},{type:'keyDown',key:'a'});
 contents.emit('did-navigate-in-page',{},site+'/course/view.php?id=2#answer',true);
 views.hide(owner,tabId,state.generation);
 expect((await views.action(owner,state.id,'discard')).status).toBe('ready');
});
it('restores the private URL after discard',async()=>{
 const {views,owner,contents,tabId}=await open();const url=site+'/course/view.php?id=2&sesskey=secret&returnurl=lesson';
 contents.emit('did-navigate',{},url);contents.emit('render-process-gone');
 views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=2'},tabId);
 await vi.waitFor(()=>expect(mock.panes.at(-1)!.contents.loadURL).toHaveBeenCalledWith(url));
});
it('does not reimport a restored completed file target',async()=>{
 const {views,owner}=await open();const marker='5f0a7a2e-8d4b-4c63-9f0e-1b2c3d4e5f60';
 const state=views.open(owner,accountId,{kind:'file',fileId:randomUUID()},randomUUID(),undefined,marker);await settle();
 expect(mock.imports).not.toHaveBeenCalled();expect(views.state(owner,state.id)).toMatchObject({status:'ready',importedDocumentId:marker,documentId:null});
});

it('cleans owner handlers after failed admission',async()=>{
 const {views,owner}=await open();await views.dispose();
 const {nativeTabPool}=await import('../native-tab-pool');const room=vi.spyOn(nativeTabPool,'makeRoom').mockReturnValue('resource-limit');
 try {views.open(owner,accountId,{kind:'page',url:site+'/course/view.php?id=2'});expect(owner.listenerCount('destroyed')).toBe(1);owner.emit('destroyed');expect(owner.listenerCount('did-start-navigation')).toBe(0);} finally {room.mockRestore();}
});

it('never reveals a native view before a document has committed',async()=>{
 const {views,owner,state}=await open();await views.action(owner,state.id,'stop');
 views.layout(owner,state.id,{x:0,y:0,width:500,height:500},{dark:false,background:'#ffffff',foreground:'#000000',accent:'#0000ff'},true,state.generation);
 expect(mock.panes.at(-1)!.visible).toBe(false);
});
