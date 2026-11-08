/**
 * Own sandboxed course-content views and their account-scoped session lifecycle.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
/** Owns isolated Moodle WebContentsViews. Only the trusted app frame can control a view; remote content has no preload. */
import { BrowserWindow, WebContentsView, session, clipboard, shell, dialog, type WebContents, type Session } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import type { MoodleAccount } from '../../shared/moodle';
import type { WebviewState, WebviewTarget, WebviewAction, WebviewBounds, WebviewTheme } from '../../shared/moodle-webview';
import type { MoodleTokens } from './auth';
import type { DocumentService } from '../services/documents';
import type { Fetch } from './client';
import { forwardNativeTabShortcut } from '../navigation-input';
import { tr } from '../i18n';
import { documentIdSchema } from '../../shared/domain';
import { MoodleWebviewSession, WebviewSessionError } from './webview-session';
import { webviewPolicy, webviewNavigation, webviewResource, webviewFile, webviewLoginPage, publicWebviewUrl, webviewLoadError, webviewPermission, type WebviewPolicy } from './webview-policy';
import { importWebviewFile } from './webview-files';
import { exchangeWebviewCookie, probeWebviewSession } from './webview-transport';
import { nativeTabPool, type NativeTabPool } from '../native-tab-pool';
import { log } from '../logging';
import { draftInput, draftProtected } from '../native-dirty';

/** Electron 42 navigation events carry no gesture flag, so real input to the view stands in for one. */
const GESTURE_WINDOW_MS = 10_000;
const IMPORT_LIMIT = 5, IMPORT_WINDOW_MS = 60_000;

interface AccountSession { account:MoodleAccount; browser:Session; policy:WebviewPolicy; auth:MoodleWebviewSession; cleanup:()=>void; imports:number[]; keepalive:ReturnType<typeof setInterval>|undefined; probing:boolean; lastProbeAt:number }
interface Pane {
  tabId:string; loaded:boolean; imported:boolean; requestedUrl:string; dirty:number; scroll:number; owner:WebContents; window:BrowserWindow; view:WebContentsView; account:AccountSession;
  state:WebviewState; target:string; retries:number; visible:boolean; active:boolean;
  timer:ReturnType<typeof setTimeout>|undefined;
  abort:AbortController; importing:boolean; externalPending:boolean;
  gestureAt:number;
}
export interface MoodleWebviewDependencies {
  account(id:string): MoodleAccount;
  credentials(id:string): Promise<MoodleTokens>;
  file(id:string): {account:MoodleAccount;url:string};
  documents:Pick<DocumentService,'importPath'>;
  request?:Fetch;
  pool?:NativeTabPool;
  configuredHosts?:{ssoOrigins?:string[];cdnOrigins?:string[];loopback?:boolean};
}
/** Own account-scoped sandboxed views and route downloads through document validation. */
export class MoodleWebviews {
  private readonly owners = new Map<number,{owner:WebContents;cleanup:()=>void;navigation:(_event:Electron.Event,url:string,inPlace:boolean,main:boolean)=>void}>();
  private readonly accounts = new Map<string,AccountSession>();
  private readonly errors = new Map<string,WebviewState>();
  private readonly generations = new Map<number,number>();
  private readonly checkpoints = new Map<string,{accountId:string;requestedUrl:string;imported:boolean;state:WebviewState;scroll:number;target:string}>();
  private readonly budgets = new Map<string,{retryAt:number}>();
  private readonly panes = new Map<string,Pane>();
  private readonly pool:NativeTabPool;
  constructor(private readonly dependencies:MoodleWebviewDependencies) {this.pool=dependencies.pool ?? nativeTabPool;}
  private account(id:string,localFile=false): AccountSession {
    const account = this.dependencies.account(id);
    if (!localFile && account.status !== 'connected') throw new WebviewSessionError('session-expired');
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
      if (pane) { const gesture = this.takeGesture(pane); void this.importFile(pane,item.getURL(),gesture && (typeof item.hasUserGesture !== 'function' || item.hasUserGesture())); }
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
    const value:AccountSession = {account,browser,policy,auth,imports:[],probing:false,lastProbeAt:Date.now(),keepalive:undefined,cleanup:() => {browser.removeListener('will-download',download);browser.webRequest.onBeforeRequest(null);browser.webRequest.onBeforeSendHeaders(null);}};
    this.accounts.set(id,value);
    return value;
  }
  open(owner:WebContents,accountId:string,target:WebviewTarget,tabId:string = randomUUID(),checkpoint?:{accountId:string;requestedUrl:string;url:string;zoom:number;scrollTop:number},importedDocumentId?:string): WebviewState {
    const window = BrowserWindow.fromWebContents(owner);
    if (!window) throw new Error('Missing app window');
    const localFile=target.kind==='file' && !!importedDocumentId;
    if(target.kind!=='file') importedDocumentId=undefined;
    const resourceKey=`${owner.id}:${tabId}`;
    if(!localFile && this.errors.has(resourceKey) && this.dependencies.account(accountId).status!=='connected') return {...this.errors.get(resourceKey)!};
    this.errors.delete(resourceKey);
    const account = this.account(accountId,localFile);
    const source = target.kind === 'file' ? this.dependencies.file(target.fileId) : null;
    if (source && source.account.id !== accountId) throw new WebviewSessionError('blocked');
    const raw = source?.url ?? (target.kind === 'page' ? target.url : '');
    const url = webviewFile(raw,account.policy) ? raw.replace('/webservice/pluginfile.php','/pluginfile.php') : raw;
    if (webviewNavigation(url,account.policy) !== 'internal') throw new WebviewSessionError('blocked');
    const key = `${owner.id}:${tabId}`;
    if(!this.owners.has(owner.id)) {
      const cleanup=()=>this.closeOwner(owner.id);
      const navigation=(_event:Electron.Event,_url:string,inPlace:boolean,main:boolean)=>{if(main && !inPlace)cleanup();};
      this.owners.set(owner.id,{owner,cleanup,navigation});
      owner.once('destroyed',cleanup);owner.on('did-start-navigation',navigation);
    }
    const generation=(this.generations.get(owner.id) ?? 0)+1;
    this.generations.set(owner.id,generation);
    for (const pane of this.panes.values()) if(pane.owner.id===owner.id) {pane.visible=false;pane.active=false;pane.view.setVisible(false);}
    let existing = this.panes.get(key);
    if(existing && (existing.account.account.id!==accountId || existing.requestedUrl!==url)) {this.closeResource(key);this.checkpoints.delete(key);existing=undefined;}
    if (existing) {existing.active=true;existing.state.generation=generation;if(!existing.imported || !webviewFile(existing.target,existing.account.policy)) void existing.account.auth.ensure().catch(error=>this.fail(existing,error));return this.state(owner,existing.state.id);}
    const candidate=this.checkpoints.get(key);
    const previous=candidate?.accountId===accountId && candidate.requestedUrl===url ? candidate : undefined;
    const saved = previous ?? (checkpoint && checkpoint.accountId===accountId && checkpoint.requestedUrl===publicWebviewUrl(url) ? {state:{zoom:checkpoint.zoom},scroll:checkpoint.scrollTop} : undefined);
    const state:WebviewState = {id:randomUUID(),generation,scrollTop:0,status:'connecting',url:publicWebviewUrl(url),title:tr('webview:title'),secure:false,canGoBack:false,canGoForward:false,zoom:1,error:null,retryAt:null,documentId:previous?.state.documentId ?? null,importedDocumentId:target.kind==='file' ? importedDocumentId ? documentIdSchema.parse(importedDocumentId) : previous?.state.importedDocumentId ?? null : null};
    if(this.pool.makeRoom(owner.id)==='resource-limit') return {...state,status:'error',error:'resource-limit'};
    const view = new WebContentsView({webPreferences:{session:account.browser,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,navigateOnDragDrop:false,spellcheck:false}});
    const pane:Pane = {tabId,loaded:false,imported:!!importedDocumentId || !!previous?.imported,requestedUrl:url,dirty:0,scroll:saved?.scroll ?? 0,owner,window,view,account,state,target:url,retries:0,visible:false,active:true,timer:undefined,abort:new AbortController(),importing:false,externalPending:false,gestureAt:0};
    const admission = this.pool.acquire({key,ownerId:owner.id,kind:'moodle',lastActiveAt:Date.now(),active:()=>pane.active,protected:()=>pane.importing || pane.externalPending || draftProtected(pane.dirty) || ['connecting','loading'].includes(pane.state.status),processId:()=>view.webContents.getOSProcessId(),discard:()=>this.discard(key)});
    if (admission === 'resource-limit') {view.webContents.close({waitForBeforeUnload:false});return {...state,status:'error',error:'resource-limit'};}
    if (saved) {pane.target=previous?.target ?? url;pane.state.zoom=saved.state.zoom;view.webContents.setZoomFactor(saved.state.zoom);}
    this.checkpoints.delete(key);
    this.panes.set(key,pane);
    window.contentView.addChildView(view);
    view.setVisible(false);
    account.keepalive ??= setInterval(()=>void this.keepaliveAccount(accountId),4*60_000);
    const contents = view.webContents;
    contents.setWindowOpenHandler(({url}) => { void this.navigate(pane,url); return {action:'deny'}; });
    contents.on('will-attach-webview',event => event.preventDefault());
    contents.on('before-mouse-event',(_event,mouse) => { if (mouse.type === 'mouseDown') pane.gestureAt = Date.now(); });
    contents.on('will-navigate',(event,url) => { if (this.guard(pane,url)) event.preventDefault(); });
    contents.on('will-redirect',(event,url) => { if (this.guard(pane,url)) event.preventDefault(); });
    contents.on('will-frame-navigate',event => { if (!event.isMainFrame && webviewNavigation(event.url,account.policy) !== 'internal') event.preventDefault(); });
    contents.on('did-start-navigation',(_event,_url,inPlace,isMainFrame) => { if (isMainFrame && !inPlace && state.status !== 'error' && state.status !== 'closed') {state.status = 'loading';view.setVisible(false);this.deadline(pane);} });
    contents.on('did-stop-loading',() => { clearTimeout(pane.timer); });
    contents.on('did-navigate',(_event,url) => this.committed(pane,url));
    contents.on('did-navigate-in-page',(_event,url,isMainFrame) => { if (isMainFrame) this.committed(pane,url,false); });
    contents.on('did-finish-load',() => {if (!pane.abort.signal.aborted && state.status === 'loading') {state.status = 'ready';view.setVisible(pane.visible && pane.loaded);if (saved) void contents.executeJavaScript(`window.scrollTo(0,${pane.scroll})`).catch(()=>{});}});
    contents.on('page-title-updated',(_event,title) => { state.title = title.replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,300); });
    contents.on('did-fail-load',(_event,code,_description,_url,isMainFrame) => { if (isMainFrame && code !== -3) this.fail(pane,new WebviewSessionError(webviewLoadError(code))); });
    contents.on('render-process-gone',() => this.discard(key));
    contents.on('certificate-error',(_event,_url,_error,_certificate,callback) => { callback(false); this.fail(pane,new WebviewSessionError('certificate')); });
    contents.on('before-input-event',(event,input) => {
      if (forwardNativeTabShortcut(owner,event,input)) return;
      if (input.type !== 'keyDown') return;
      pane.gestureAt = Date.now();
      if (draftInput(input)) pane.dirty=Date.now();
      const modifier = input.meta || input.control;
      const action:WebviewAction|undefined = modifier && input.key.toLowerCase() === 'r' ? 'reload' : modifier && input.key === '[' ? 'back' : modifier && input.key === ']' ? 'forward' : modifier && ['+','='].includes(input.key) ? 'zoom-in' : modifier && input.key === '-' ? 'zoom-out' : modifier && input.key === '0' ? 'zoom-reset' : undefined;
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
    if(pane.state.error==='session-expired') for(const sibling of this.panes.values()) {
      if(sibling===pane || sibling.account!==pane.account) continue;
      sibling.state.status='error';sibling.state.error='session-expired';sibling.state.secure=false;sibling.state.retryAt=pane.state.retryAt;
      sibling.view.setVisible(false);clearTimeout(sibling.timer);
    }
  }
  private async load(pane:Pane,force = false) {
    pane.state.status = 'connecting'; pane.state.error = null;
    pane.view.setVisible(false);
    if(pane.imported && webviewFile(pane.target,pane.account.policy)) {pane.state.status='ready';return;}
    try {
      if (this.dependencies.account(pane.account.account.id).status !== 'connected') throw new WebviewSessionError('session-expired');
      await pane.account.auth.ensure(force);
      for(const sibling of this.panes.values()) if(sibling!==pane && sibling.account===pane.account && sibling.state.error==='session-expired') void this.load(sibling);
      if (!pane.abort.signal.aborted) {
        if (webviewFile(pane.target,pane.account.policy)) await this.importFile(pane,pane.target,true);
        else await this.navigate(pane,pane.target);
      }
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
    if (webviewFile(url,pane.account.policy)) { void this.importFile(pane,url,this.takeGesture(pane)); return true; }
    return false;
  }
  private async navigate(pane:Pane,url:string) {
    if (pane.abort.signal.aborted || this.guard(pane,url)) return;
    pane.target = url; pane.state.status = 'loading'; pane.state.error = null;
    this.deadline(pane);
    try { await pane.view.webContents.loadURL(url); }
    catch { if (pane.state.status === 'loading') this.fail(pane,new WebviewSessionError('load-failed')); }
  }
  private committed(pane:Pane,url:string,replaced=true) {
    if (webviewLoginPage(url,pane.account.policy)) { this.guard(pane,url); return; }
    if (webviewNavigation(url,pane.account.policy) !== 'internal') {this.fail(pane,new WebviewSessionError('blocked'));return;}
    pane.state.url = publicWebviewUrl(url); pane.state.secure = new URL(url).protocol === 'https:';
    pane.target = url; pane.loaded=true; if(replaced) pane.dirty=0;
  }
  private takeGesture(pane:Pane) { const fresh = pane.gestureAt > 0 && Date.now() - pane.gestureAt <= GESTURE_WINDOW_MS; pane.gestureAt = 0; return fresh; }
  private async importFile(pane:Pane,url:string,gesture:boolean) {
    if (pane.importing || pane.abort.signal.aborted) return;
    if (!gesture) { log({phase:'moodle-webview-import-refused',reason:'no-gesture'}); this.fail(pane,new WebviewSessionError('blocked')); return; }
    const now = Date.now();
    pane.account.imports = pane.account.imports.filter(at => now - at < IMPORT_WINDOW_MS);
    if (pane.account.imports.length >= IMPORT_LIMIT) { log({phase:'moodle-webview-import-refused',reason:'rate-limit'}); this.fail(pane,new WebviewSessionError('blocked')); return; }
    pane.account.imports.push(now);
    pane.importing = true; pane.state.status = 'loading';
    pane.view.setVisible(false);
    try {
      const id = await importWebviewFile(url,pane.account.policy,pane.account.browser.fetch.bind(pane.account.browser),this.dependencies.documents,AbortSignal.any([pane.abort.signal,AbortSignal.timeout(120_000)]));
      if (!pane.abort.signal.aborted) {pane.imported=true;pane.state.documentId = documentIdSchema.parse(id);pane.state.importedDocumentId=pane.state.documentId;pane.state.status = 'ready';}
    } catch (error) { this.fail(pane,error); }
    finally { pane.importing = false; }
  }
  private async keepaliveAccount(id:string) {
    const account=this.accounts.get(id);
    if (!account || account.probing || Date.now()-account.lastProbeAt<4*60_000) return;
    const panes=[...this.panes.values()].filter(pane=>pane.account===account);
    if (!panes.some(pane=>pane.visible && pane.state.status==='ready' && !(pane.imported && webviewFile(pane.target,pane.account.policy)))) return;
    account.probing=true;account.lastProbeAt=Date.now();
    try {
      if (!await probeWebviewSession(account.browser,account.policy,AbortSignal.timeout(15_000))) {
        await account.auth.ensure(true);
        if(!await probeWebviewSession(account.browser,account.policy,AbortSignal.timeout(15_000))) for (const pane of panes) this.fail(pane,new WebviewSessionError('session-expired'));
      }
    } catch (error) {for (const pane of panes) this.fail(pane,error);}
    finally {account.probing=false;}
  }
  private pane(owner:WebContents,id:string) { const pane = [...this.panes.values()].find(pane=>pane.owner.id===owner.id && pane.state.id===id); if (!pane) throw new Error('Unknown Moodle pane'); return pane; }
  assertTab(owner:WebContents,tabId:string,id:string) {if(this.errors.get(`${owner.id}:${tabId}`)?.id===id) return;if(this.pane(owner,id).tabId!==tabId) throw new Error('Unknown Moodle tab');}
  hide(owner:WebContents,tabId:string,generation?:number) {
    const pane=this.panes.get(`${owner.id}:${tabId}`);
    if (pane && (generation===undefined || generation===pane.state.generation)) {this.pool.touch(`${owner.id}:${tabId}`);pane.visible=false;pane.active=false;pane.view.setVisible(false);}
  }
  private discard(key:string) {
    const pane=this.panes.get(key);
    if (!pane) return;
    const checkpoint={accountId:pane.account.account.id,requestedUrl:pane.requestedUrl,imported:pane.imported,state:{...pane.state,url:publicWebviewUrl(pane.state.url)},scroll:pane.scroll,target:pane.target};
    this.checkpoints.set(key,checkpoint);

    this.closeResource(key);
  }
  sync(owner:WebContents,tabIds:string[]) {for(const key of this.errors.keys()) if(key.startsWith(`${owner.id}:`) && !tabIds.includes(key.slice(key.indexOf(':')+1))) this.errors.delete(key);for(const key of this.checkpoints.keys()) if(key.startsWith(`${owner.id}:`) && !tabIds.includes(key.slice(key.indexOf(':')+1))) this.checkpoints.delete(key);for (const [key,pane] of this.panes) if (pane.owner.id===owner.id && !tabIds.includes(pane.tabId)) this.closeResource(key);return tabIds.flatMap(tabId=>{const key=`${owner.id}:${tabId}`,pane=this.panes.get(key);return this.errors.has(key) ? [{tabId,status:'error' as const}] : pane ? [{tabId,status:(['connecting','loading'].includes(pane.state.status)?'loading':'live') as 'loading'|'live'|'discarded'|'error'}] : this.checkpoints.has(key) ? [{tabId,status:'discarded' as const}] : [];});}
  private sampleScroll(pane:Pane) {
    const contents=pane.view.webContents;
    if(contents.isDestroyed() || typeof contents.executeJavaScript!=='function') return;
    void contents.executeJavaScript('Math.max(0, Math.min(10000000, Number(window.scrollY) || 0))').then((value:unknown)=>{
      if(typeof value!=='number' || !Number.isFinite(value)) return;
      pane.scroll=Math.max(0,Math.min(10000000,value));
    }).catch(()=>undefined);
  }
  state(owner:WebContents,id:string):WebviewState {
    const failed=[...this.errors.entries()].find(([key,state])=>key.startsWith(`${owner.id}:`) && state.id===id);
    if(failed) return {...failed[1]};
    const pane = this.pane(owner,id);
    if(pane.state.status==='ready' && pane.visible) this.sampleScroll(pane);
    const documentId=pane.state.documentId;
    return {...pane.state,documentId,scrollTop:pane.scroll,canGoBack:pane.view.webContents.navigationHistory.canGoBack(),canGoForward:pane.view.webContents.navigationHistory.canGoForward()};
  }
  layout(owner:WebContents,id:string,bounds:WebviewBounds,theme:WebviewTheme,visible:boolean,generation?:number) {
    if ([...this.errors.entries()].some(([key,state])=>key.startsWith(`${owner.id}:`) && state.id===id)) return;
    if (generation !== undefined && generation !== this.generations.get(owner.id)) return;
    const pane = this.pane(owner,id), [width=0,height=0] = pane.window.getContentSize(), zoom = owner.getZoomFactor();
    const x = Math.min(Math.round(bounds.x * zoom),width), y = Math.min(Math.round(bounds.y * zoom),height);
    pane.view.setBounds({x,y,width:Math.min(Math.round(bounds.width * zoom),width - x),height:Math.min(Math.round(bounds.height * zoom),height - y)});
    if (visible) {for (const sibling of this.panes.values()) if (sibling.owner.id===owner.id && sibling!==pane) {sibling.visible=false;sibling.view.setVisible(false);}this.pool.touch(`${owner.id}:${pane.tabId}`);}
    pane.visible = visible && bounds.width > 0 && bounds.height > 0;
    if (pane.visible) void this.keepaliveAccount(pane.account.account.id);
    pane.view.setBackgroundColor(theme.background);
    pane.view.setVisible(pane.visible && pane.state.status === 'ready' && !pane.state.error && !pane.importing && pane.loaded && !webviewFile(pane.target,pane.account.policy));
  }
  async action(owner:WebContents,id:string,action:WebviewAction):Promise<WebviewState> {
    const failed=[...this.errors.entries()].find(([key,state])=>key.startsWith(`${owner.id}:`) && state.id===id);
    if(failed) {if(action==='close') {this.errors.delete(failed[0]);return {...failed[1],status:'closed'};}return {...failed[1]};}
    const pane = this.pane(owner,id), contents = pane.view.webContents;
    if (action === 'discard') {if(!pane.active && !pane.importing && !pane.externalPending && !draftProtected(pane.dirty) && !['connecting','loading'].includes(pane.state.status)) {const state={...pane.state,status:'discarded' as const};this.discard(`${owner.id}:${pane.tabId}`);return state;}return this.state(owner,id);}
    if (action === 'close') {const state = {...pane.state,status:'closed' as const};this.checkpoints.delete(`${owner.id}:${pane.tabId}`);this.closeResource(`${owner.id}:${pane.tabId}`);return state;}
    if (action === 'ack-document') pane.state.documentId=null;
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    if (action === 'reload') {pane.imported=false;pane.retries = 0;pane.gestureAt = 0;void this.load(pane);}
    if (action === 'reconnect') {pane.imported=false;pane.retries = 0;pane.gestureAt = 0;void this.load(pane,true);}
    if (action === 'stop') {contents.stop();clearTimeout(pane.timer);if (pane.state.status === 'loading') {if(pane.loaded) pane.state.status='ready';else this.fail(pane,new WebviewSessionError('load-failed'));}}
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
  private closeOwner(ownerId:number) {
    for(const [key,pane] of this.panes) if(pane.owner.id===ownerId) this.closeResource(key);
    for(const key of this.checkpoints.keys()) if(key.startsWith(`${ownerId}:`)) this.checkpoints.delete(key);
    for(const key of this.errors.keys()) if(key.startsWith(`${ownerId}:`)) this.errors.delete(key);
    this.generations.delete(ownerId);
    const handlers=this.owners.get(ownerId);if(handlers){handlers.owner.removeListener('destroyed',handlers.cleanup);handlers.owner.removeListener('did-start-navigation',handlers.navigation);this.owners.delete(ownerId);}
  }
  private closeResource(id:string) {
    const pane = this.panes.get(id);
    if (!pane) return;
    this.panes.delete(id); pane.abort.abort(); clearTimeout(pane.timer); this.pool.release(id);
    if(![...this.panes.values()].some(other=>other.account===pane.account)) {clearInterval(pane.account.keepalive);pane.account.keepalive=undefined;}
    if (!pane.window.isDestroyed()) pane.window.contentView.removeChildView(pane.view);
    if (!pane.view.webContents.isDestroyed()) pane.view.webContents.close({waitForBeforeUnload:false});

  }
  async disconnect(id:string) {
    for(const [key,checkpoint] of this.checkpoints) if(checkpoint.accountId===id) this.checkpoints.delete(key);
    for (const pane of this.panes.values()) if (pane.account.account.id === id) {const key=`${pane.owner.id}:${pane.tabId}`;this.errors.set(key,{...pane.state,status:'error',error:'session-expired'});this.closeResource(key);}
    const account = this.accounts.get(id); this.accounts.delete(id);
    if (account) {clearInterval(account.keepalive);await account.auth.dispose(); account.cleanup(); await account.browser.clearCache(); await account.browser.closeAllConnections();}
  }
  async dispose() { for(const id of [...this.owners.keys()]) this.closeOwner(id); for (const pane of this.panes.values()) this.closeResource(`${pane.owner.id}:${pane.tabId}`); await Promise.all([...this.accounts.keys()].map(id => this.disconnect(id))); }
}
