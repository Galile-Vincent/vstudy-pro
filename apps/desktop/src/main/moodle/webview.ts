/** Owns isolated Moodle WebContentsViews. Only the trusted app frame can control a view; remote content has no preload. */
import { BrowserWindow, WebContentsView, session, clipboard, shell, dialog, type WebContents, type Session } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import type { MoodleAccount } from '../../shared/moodle';
import type { WebviewState, WebviewTarget, WebviewAction, WebviewBounds, WebviewTheme } from '../../shared/moodle-webview';
import type { MoodleTokens } from './auth';
import type { DocumentService } from '../services/documents';
import type { Fetch } from './client';
import { tr } from '../i18n';
import { documentIdSchema } from '../../shared/domain';
import { MoodleWebviewSession, WebviewSessionError } from './webview-session';
import { webviewPolicy, webviewNavigation, webviewResource, webviewFile, webviewLoginPage, publicWebviewUrl, webviewLoadError, webviewPermission, type WebviewPolicy } from './webview-policy';
import { importWebviewFile } from './webview-files';
import { exchangeWebviewCookie, probeWebviewSession } from './webview-transport';

interface AccountSession { account:MoodleAccount; browser:Session; policy:WebviewPolicy; auth:MoodleWebviewSession; cleanup:()=>void }
interface Pane {
  owner:WebContents; window:BrowserWindow; view:WebContentsView; account:AccountSession;
  state:WebviewState; target:string; retries:number; visible:boolean; theme:WebviewTheme|null;
  css:string|null; timer:ReturnType<typeof setTimeout>|undefined; keepalive:ReturnType<typeof setInterval>;
  abort:AbortController; importing:boolean; externalPending:boolean; cleanup:()=>void;
}
export interface MoodleWebviewDependencies {
  account(id:string): MoodleAccount;
  credentials(id:string): Promise<MoodleTokens>;
  file(id:string): {account:MoodleAccount;url:string};
  documents:Pick<DocumentService,'importPath'>;
  request?:Fetch;
  configuredHosts?:{ssoOrigins?:string[];cdnOrigins?:string[];loopback?:boolean};
}
export class MoodleWebviews {
  private readonly accounts = new Map<string,AccountSession>();
  private readonly budgets = new Map<string,{retryAt:number}>();
  private readonly panes = new Map<number,Pane>();
  constructor(private readonly dependencies:MoodleWebviewDependencies) {}
  private account(id:string): AccountSession {
    const account = this.dependencies.account(id);
    if (account.status !== 'connected') throw new WebviewSessionError('session-expired');
    const existing = this.accounts.get(id);
    if (existing) return existing;
    const policy = webviewPolicy(account.siteUrl,this.dependencies.configuredHosts);
    const partition = 'moodle-content-' + createHash('sha256').update(account.id + '\0' + account.siteUrl).digest('hex');
    const browser = session.fromPartition(partition,{cache:false});
    browser.setPermissionRequestHandler((_contents,permission,callback) => callback(webviewPermission(permission)));
    browser.setPermissionCheckHandler((_contents,permission) => webviewPermission(permission));
    browser.setDevicePermissionHandler(() => false);
    browser.setDisplayMediaRequestHandler((_request,callback) => callback({}));
    browser.webRequest.onBeforeRequest((details,callback) => {
      const exchange = (details.webContentsId === undefined || details.webContentsId === -1) && details.method === 'POST' && details.url === account.siteUrl + '/admin/tool/mobile/autologin.php';
      callback({cancel:!exchange && !webviewResource(details.url,policy)});
    });
    browser.webRequest.onBeforeSendHeaders((details,callback) => {
      const requestHeaders = {...details.requestHeaders};
      for (const key of Object.keys(requestHeaders)) if (key.toLowerCase() === 'referer') delete requestHeaders[key];
      callback({requestHeaders});
    });
    const download = (event:Electron.Event,item:Electron.DownloadItem,contents:WebContents) => {
      event.preventDefault();
      const pane = [...this.panes.values()].find(p => p.view.webContents === contents);
      if (pane) void this.importFile(pane,item.getURL());
    };
    browser.on('will-download',download);
    const hasCookie = async () => (await browser.cookies.get({url:account.siteUrl + '/'})).some(cookie => cookie.name.startsWith('MoodleSession') && !!cookie.value);
    const budget = this.budgets.get(id) ?? {retryAt:0};
    this.budgets.set(id,budget);
    const auth = new MoodleWebviewSession(account.siteUrl,{
      credentials:() => this.dependencies.credentials(id), hasCookie,
      clear:() => browser.clearStorageData(),
      exchange:(key,signal) => exchangeWebviewCookie(browser,policy,account.remoteUserId,key,signal),
    },Date.now,this.dependencies.request,budget);
    const value = {account,browser,policy,auth,cleanup:() => {browser.removeListener('will-download',download);browser.webRequest.onBeforeRequest(null);browser.webRequest.onBeforeSendHeaders(null);}};
    this.accounts.set(id,value);
    return value;
  }
  open(owner:WebContents,accountId:string,target:WebviewTarget): WebviewState {
    const window = BrowserWindow.fromWebContents(owner);
    if (!window) throw new Error('Missing app window');
    const account = this.account(accountId);
    const source = target.kind === 'file' ? this.dependencies.file(target.fileId) : null;
    if (source && source.account.id !== accountId) throw new WebviewSessionError('blocked');
    const raw = source?.url ?? (target.kind === 'page' ? target.url : '');
    const url = webviewFile(raw,account.policy) ? raw.replace('/webservice/pluginfile.php','/pluginfile.php') : raw;
    if (webviewNavigation(url,account.policy) !== 'internal') throw new WebviewSessionError('blocked');
    this.closeOwner(owner.id);
    const view = new WebContentsView({webPreferences:{session:account.browser,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,navigateOnDragDrop:false,spellcheck:false}});
    const state:WebviewState = {id:randomUUID(),status:'connecting',url:publicWebviewUrl(url),title:tr('webview:title'),secure:false,canGoBack:false,canGoForward:false,zoom:1,error:null,retryAt:null,documentId:null};
    const cleanup = () => this.closeOwner(owner.id);
    const pane:Pane = {owner,window,view,account,state,target:url,retries:0,visible:false,theme:null,css:null,timer:undefined,keepalive:setInterval(() => void this.keepalive(pane),4 * 60_000),abort:new AbortController(),importing:false,externalPending:false,cleanup};
    this.panes.set(owner.id,pane);
    window.contentView.addChildView(view);
    view.setVisible(false);
    owner.once('destroyed',cleanup);
    owner.on('did-start-navigation',cleanup);
    const contents = view.webContents;
    contents.setWindowOpenHandler(({url}) => { void this.navigate(pane,url); return {action:'deny'}; });
    contents.on('will-attach-webview',event => event.preventDefault());
    contents.on('will-navigate',(event,url) => { if (this.guard(pane,url)) event.preventDefault(); });
    contents.on('will-redirect',(event,url) => { if (this.guard(pane,url)) event.preventDefault(); });
    contents.on('will-frame-navigate',event => { if (!event.isMainFrame && webviewNavigation(event.url,account.policy) !== 'internal') event.preventDefault(); });
    contents.on('did-start-loading',() => { if (state.status !== 'error' && state.status !== 'closed') state.status = 'loading'; this.deadline(pane); });
    contents.on('did-stop-loading',() => { clearTimeout(pane.timer); });
    contents.on('did-navigate',(_event,url) => this.committed(pane,url));
    contents.on('did-navigate-in-page',(_event,url,isMainFrame) => { if (isMainFrame) this.committed(pane,url); });
    contents.on('did-finish-load',() => { if (state.status === 'loading') state.status = 'ready'; void this.style(pane); });
    contents.on('page-title-updated',(_event,title) => { state.title = title.replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,300); });
    contents.on('did-fail-load',(_event,code,_description,_url,isMainFrame) => { if (isMainFrame && code !== -3) this.fail(pane,new WebviewSessionError(webviewLoadError(code))); });
    contents.on('render-process-gone',() => this.fail(pane,new WebviewSessionError('load-failed')));
    contents.on('certificate-error',(_event,_url,_error,_certificate,callback) => { callback(false); this.fail(pane,new WebviewSessionError('certificate')); });
    contents.on('before-input-event',(event,input) => {
      if (input.type !== 'keyDown') return;
      const modifier = input.meta || input.control;
      const action:WebviewAction|undefined = input.key === 'Escape' ? 'close' : modifier && input.key.toLowerCase() === 'r' ? 'reload' : modifier && input.key === '[' ? 'back' : modifier && input.key === ']' ? 'forward' : modifier && ['+','='].includes(input.key) ? 'zoom-in' : modifier && input.key === '-' ? 'zoom-out' : modifier && input.key === '0' ? 'zoom-reset' : undefined;
      if (action) { event.preventDefault(); void this.action(owner,state.id,action); }
    });
    void this.load(pane);
    return {...state};
  }
  private deadline(pane:Pane) { clearTimeout(pane.timer); pane.timer = setTimeout(() => { if (!pane.abort.signal.aborted) {this.fail(pane,new WebviewSessionError('timeout'));pane.view.webContents.stop();} },30_000); }
  private fail(pane:Pane,error:unknown) {
    if (pane.abort.signal.aborted) return;
    pane.state.status = 'error'; pane.state.secure = false;
    pane.state.error = error instanceof WebviewSessionError ? error.code : 'load-failed';
    pane.state.retryAt = error instanceof WebviewSessionError ? error.retryAt : null;
    pane.view.setVisible(false); clearTimeout(pane.timer);
  }
  private async load(pane:Pane,force = false) {
    pane.state.status = 'connecting'; pane.state.error = null;
    pane.view.setVisible(false);
    try {
      if (this.dependencies.account(pane.account.account.id).status !== 'connected') throw new WebviewSessionError('session-expired');
      await pane.account.auth.ensure(force);
      if (!pane.abort.signal.aborted) await this.navigate(pane,pane.target);
    } catch (error) { this.fail(pane,error); }
  }
  private guard(pane:Pane,url:string): boolean {
    if (webviewLoginPage(url,pane.account.policy)) {
      if (pane.retries++ === 0) void this.load(pane,true);
      else this.fail(pane,new WebviewSessionError('session-expired',pane.account.auth.retryAt || null));
      return true;
    }
    const rule = webviewNavigation(url,pane.account.policy);
    if (rule !== 'internal') { if (rule === 'external') void this.external(pane,url); else this.fail(pane,new WebviewSessionError('blocked')); return true; }
    if (webviewFile(url,pane.account.policy)) { void this.importFile(pane,url); return true; }
    return false;
  }
  private async navigate(pane:Pane,url:string) {
    if (pane.abort.signal.aborted || this.guard(pane,url)) return;
    pane.target = url; pane.state.status = 'loading'; pane.state.error = null;
    this.deadline(pane);
    try { await pane.view.webContents.loadURL(url); }
    catch { if (pane.state.status === 'loading') this.fail(pane,new WebviewSessionError('load-failed')); }
  }
  private committed(pane:Pane,url:string) {
    if (webviewLoginPage(url,pane.account.policy)) { this.guard(pane,url); return; }
    if (webviewNavigation(url,pane.account.policy) !== 'internal') {this.fail(pane,new WebviewSessionError('blocked'));return;}
    pane.state.url = publicWebviewUrl(url); pane.state.secure = new URL(url).protocol === 'https:';
    pane.target = url;
    pane.view.setVisible(pane.visible && !pane.state.error);
  }
  private async importFile(pane:Pane,url:string) {
    if (pane.importing || pane.abort.signal.aborted) return;
    pane.importing = true; pane.state.status = 'loading';
    pane.view.setVisible(false);
    try {
      const id = await importWebviewFile(url,pane.account.policy,pane.account.browser.fetch.bind(pane.account.browser),this.dependencies.documents,AbortSignal.any([pane.abort.signal,AbortSignal.timeout(120_000)]));
      if (!pane.abort.signal.aborted) {pane.state.documentId = documentIdSchema.parse(id);pane.state.status = 'ready';}
    } catch (error) { this.fail(pane,error); }
    finally { pane.importing = false; }
  }
  private async keepalive(pane:Pane) {
    if (!pane.visible || pane.state.status !== 'ready') return;
    try {
      if (!await probeWebviewSession(pane.account.browser,pane.account.policy,AbortSignal.any([pane.abort.signal,AbortSignal.timeout(15_000)]))) this.guard(pane,pane.account.account.siteUrl + '/login/index.php');
    } catch (error) { this.fail(pane,error); }
  }
  private pane(owner:WebContents,id:string) { const pane = this.panes.get(owner.id); if (!pane || pane.state.id !== id) throw new Error('Unknown Moodle pane'); return pane; }
  state(owner:WebContents,id:string):WebviewState {
    const pane = this.pane(owner,id);
    return {...pane.state,canGoBack:pane.view.webContents.navigationHistory.canGoBack(),canGoForward:pane.view.webContents.navigationHistory.canGoForward()};
  }
  layout(owner:WebContents,id:string,bounds:WebviewBounds,theme:WebviewTheme,visible:boolean) {
    const pane = this.pane(owner,id), [width=0,height=0] = pane.window.getContentSize(), zoom = owner.getZoomFactor();
    const x = Math.min(Math.round(bounds.x * zoom),width), y = Math.min(Math.round(bounds.y * zoom),height);
    pane.view.setBounds({x,y,width:Math.min(Math.round(bounds.width * zoom),width - x),height:Math.min(Math.round(bounds.height * zoom),height - y)});
    pane.visible = visible && bounds.width > 0 && bounds.height > 0;
    pane.view.setVisible(pane.visible && ['ready','loading'].includes(pane.state.status) && !pane.state.error && !pane.importing);
    if (JSON.stringify(theme) !== JSON.stringify(pane.theme)) { pane.theme = theme; void this.style(pane); }
  }
  private async style(pane:Pane) {
    if (!pane.theme || pane.abort.signal.aborted) return;
    const {dark,background,foreground,accent} = pane.theme;
    try {
      if (pane.css) await pane.view.webContents.removeInsertedCSS(pane.css);
      pane.css = await pane.view.webContents.insertCSS(`:root {color-scheme:${dark ? 'dark' : 'light'};--vstudy-bg:${background};--vstudy-fg:${foreground};--vstudy-accent:${accent}} body,#page,#page-content,#region-main,.card,.drawer,.navbar {background-color:var(--vstudy-bg)!important;color:var(--vstudy-fg)!important} a {color:var(--vstudy-accent)} input,textarea,select {color-scheme:${dark ? 'dark' : 'light'}}`,{cssOrigin:'user'});
    } catch { /* Navigation can replace a document while its previous style is removed. */ }
  }
  async action(owner:WebContents,id:string,action:WebviewAction):Promise<WebviewState> {
    const pane = this.pane(owner,id), contents = pane.view.webContents;
    if (action === 'close') {const state = {...pane.state,status:'closed' as const};this.closeOwner(owner.id);return state;}
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    if (action === 'reload') {pane.retries = 0;void this.load(pane);}
    if (action === 'reconnect') {pane.retries = 0;void this.load(pane,true);}
    if (action === 'stop') {contents.stop();clearTimeout(pane.timer);if (pane.state.status === 'loading') pane.state.status = 'ready';}
    if (action === 'focus') contents.focus();
    if (action === 'external') await this.external(pane,pane.state.url);
    if (action === 'copy') clipboard.writeText(pane.state.url);
    if (action.startsWith('zoom-')) {pane.state.zoom = action === 'zoom-reset' ? 1 : Math.max(.5,Math.min(2,pane.state.zoom + (action === 'zoom-in' ? .1 : -.1)));contents.setZoomFactor(pane.state.zoom);}
    return this.state(owner,id);
  }
  private async external(pane:Pane,url:string) {
    if (pane.externalPending || pane.abort.signal.aborted || webviewNavigation(url,pane.account.policy) === 'blocked') return;
    pane.externalPending = true;
    const safe = publicWebviewUrl(url);
    try {
      const result = await dialog.showMessageBox(pane.window,{type:'question',message:tr('webview:external_confirm'),detail:safe,buttons:[tr('common:cancel'),tr('common:open')],defaultId:0,cancelId:0});
      if (result.response === 1 && !pane.abort.signal.aborted) await shell.openExternal(safe);
    } catch {this.fail(pane,new WebviewSessionError('load-failed'));}
    finally {pane.externalPending = false;}
  }
  private closeOwner(id:number) {
    const pane = this.panes.get(id);
    if (!pane) return;
    this.panes.delete(id); pane.abort.abort(); clearTimeout(pane.timer); clearInterval(pane.keepalive);
    pane.owner.removeListener('destroyed',pane.cleanup); pane.owner.removeListener('did-start-navigation',pane.cleanup);
    if (!pane.window.isDestroyed()) pane.window.contentView.removeChildView(pane.view);
    if (!pane.view.webContents.isDestroyed()) pane.view.webContents.close({waitForBeforeUnload:false});
    if (!pane.owner.isDestroyed()) pane.owner.focus();
  }
  async disconnect(id:string) {
    for (const pane of this.panes.values()) if (pane.account.account.id === id) this.closeOwner(pane.owner.id);
    const account = this.accounts.get(id); this.accounts.delete(id);
    if (account) {await account.auth.dispose(); account.cleanup(); await account.browser.clearCache(); await account.browser.closeAllConnections();}
  }
  async dispose() { for (const pane of this.panes.values()) this.closeOwner(pane.owner.id); await Promise.all([...this.accounts.keys()].map(id => this.disconnect(id))); }
}
