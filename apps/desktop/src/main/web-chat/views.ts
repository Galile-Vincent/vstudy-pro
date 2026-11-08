/** Main owns persistent, isolated provider views and bounded OAuth child windows. */
import { BrowserWindow, WebContentsView, session, dialog, type Session, type WebContents } from 'electron';
import { webChatClearedChannel, type WebChatProvider, type WebChatState } from '../../shared/web-chat';
import type { WebviewBounds } from '../../shared/moodle-webview';
import { webChatProviders, webChatNavigation, webChatResource, safeWebChatUrl } from './policy';
import { nativeTabPool } from '../native-tab-pool';
import { forwardNativeTabShortcut } from '../navigation-input';
import { tr } from '../i18n';
import { draftInput, draftProtected } from '../native-dirty';
interface Pane { owner:WebContents; window:BrowserWindow; view:WebContentsView; provider:WebChatProvider; tabId:string; slotId:string; generation:number; status:WebChatState['status']; popup:BrowserWindow|undefined; visible:boolean; active:boolean; pending:boolean; dirty:number; gestureAt:number }
const preferences = {sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,navigateOnDragDrop:false};
export class WebChats {
  private generation=0;
  private readonly checkpoints=new Map<string,{tabId:string;provider:WebChatProvider;url:string;title:string}>();
  private readonly panes=new Map<string,Pane>();
  private readonly sessions=new Map<WebChatProvider,Session>();
  private readonly owners=new Map<number,{owner:WebContents;cleanup:()=>void;navigation:(_event:Electron.Event,_url:string,inPlace:boolean,main:boolean)=>void}>();
  private readonly clearing=new Set<WebChatProvider>();
  constructor(private readonly external:(owner:WebContents,url:string)=>Promise<void>) {}
  private registerOwner(owner:WebContents) {
    if (!this.owners.has(owner.id)) {
      const cleanup=()=>this.closeOwner(owner);
      const navigation=(_event:Electron.Event,_url:string,inPlace:boolean,main:boolean)=>{if(main && !inPlace)cleanup();};
      this.owners.set(owner.id,{owner,cleanup,navigation});owner.once('destroyed',cleanup);owner.on('did-start-navigation',navigation);
    }
  }
  private browser(provider:WebChatProvider) {
    let browser=this.sessions.get(provider);
    if (browser) return browser;
    browser=session.fromPartition(`persist:web-chat-${provider}`,{cache:true});
    browser.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    browser.setPermissionCheckHandler(()=>false);
    browser.setDevicePermissionHandler(()=>false);
    browser.setDisplayMediaRequestHandler((_request,callback)=>callback({}));
    browser.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!webChatResource(details.url)}));
    browser.on('will-download',event=>event.preventDefault());
    this.sessions.set(provider,browser);
    return browser;
  }
  private key(owner:WebContents,tabId:string,slotId='page') { return `${owner.id}:${tabId}:${slotId}`; }
  private pane(owner:WebContents,provider:WebChatProvider,tabId:string,slotId='page') {
    const pane=this.panes.get(this.key(owner,tabId,slotId));
    if (!pane || pane.provider!==provider || this.clearing.has(provider)) throw new Error('Web chat unavailable');
    return pane;
  }
  open(owner:WebContents,provider:WebChatProvider,tabId:string,slotId='page',restoreUrl?:string):WebChatState {
    if (this.clearing.has(provider)) throw new Error('Web chat clearing');
    let existing=this.panes.get(this.key(owner,tabId,slotId));
    if(existing && existing.provider!==provider){this.close(existing);this.panes.delete(this.key(owner,tabId,slotId));existing=undefined;}
    for(const other of this.panes.values()) if(other.owner===owner) {other.active=false;this.visibility(other,false);}
    if (existing) {existing.active=true;existing.generation=++this.generation;if(existing.status==='error')this.load(existing,this.checkpoint(existing).url);return this.state(owner,provider,tabId,slotId);}
    const window=BrowserWindow.fromWebContents(owner);
    if (!window) throw new Error('Missing owner');
    if(nativeTabPool.makeRoom(owner.id)==='resource-limit') return {status:'resource-limit',generation:0,url:webChatProviders[provider].url,title:'',canGoBack:false,canGoForward:false};
    const view=new WebContentsView({webPreferences:{...preferences,session:this.browser(provider)}});
    const pane:Pane={owner,window,view,provider,tabId,slotId,generation:++this.generation,status:'loading',popup:undefined,visible:false,active:true,pending:false,dirty:0,gestureAt:0};
    const key=this.key(owner,tabId,slotId);
    if(nativeTabPool.acquire({key,ownerId:owner.id,kind:'web-chat',lastActiveAt:Date.now(),active:()=>pane.active,protected:()=>!!pane.popup || pane.pending || draftProtected(pane.dirty) || pane.status==='loading',processId:()=>view.webContents.getOSProcessId(),discard:()=>this.discard(pane)})==='resource-limit') {view.webContents.close({waitForBeforeUnload:false});throw new Error('Native view resource limit');}
    this.panes.set(key,pane);
    window.contentView.addChildView(view);view.setVisible(false);
    this.guard(pane,view.webContents,true);
    view.webContents.on('did-navigate',()=>{pane.dirty=0;});
    view.webContents.on('did-start-loading',()=>{pane.status='loading';});
    view.webContents.on('did-finish-load',()=>{if(webChatNavigation(provider,view.webContents.getURL())) pane.status='ready';});
    view.webContents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main && code!==-3) pane.status='error';});
    view.webContents.on('render-process-gone',()=>this.discard(pane));
    this.registerOwner(owner);
    const saved=safeWebChatUrl(restoreUrl ?? '');
    if(saved){saved.search='';saved.hash='';}
    this.load(pane,(this.checkpoints.get(key)?.provider===provider?this.checkpoints.get(key)?.url:undefined) ?? (saved?.origin===new URL(webChatProviders[provider].url).origin?saved.href:webChatProviders[provider].url));
    return this.state(owner,provider,tabId,slotId);
  }
  private load(pane:Pane,url:string) {
    pane.status='loading';
    void pane.view.webContents.loadURL(url).catch(()=>{if (!pane.view.webContents.isDestroyed()) pane.status='error';});
  }
  private guard(pane:Pane,contents:WebContents,popups:boolean) {
    contents.on('will-attach-webview',event=>event.preventDefault());
    contents.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown') pane.gestureAt=Date.now();});
    contents.on('before-input-event',(event,input)=>{if(popups && forwardNativeTabShortcut(pane.owner,event,input)) return;if(input.type==='keyDown') {pane.gestureAt=Date.now();if(draftInput(input)) pane.dirty=Date.now();}});
    const navigate=(event:Electron.Event,url:string)=>{
      if (webChatNavigation(pane.provider,url)) return;
      event.preventDefault();void this.openExternal(pane,url);
    };
    contents.on('will-navigate',navigate);contents.on('will-redirect',navigate);
    contents.on('will-frame-navigate',event=>{if(event.isMainFrame) navigate(event,event.url);else if(!webChatResource(event.url)) event.preventDefault();});
    contents.on('certificate-error',(_event,_url,_error,_certificate,callback)=>callback(false));
    contents.setWindowOpenHandler(({url})=>{
      if (!popups || pane.popup || !pane.visible) return {action:'deny'};
      if (!webChatNavigation(pane.provider,url)) {void this.openExternal(pane,url);return {action:'deny'};}
      // createWindow installs guards before Electron loads the URL, retaining the OAuth opener.
      return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{...preferences,session:this.browser(pane.provider)}},createWindow:(options)=>{
        const child=new BrowserWindow({...options,parent:pane.window,width:520,height:740,autoHideMenuBar:true,webPreferences:{...preferences,session:this.browser(pane.provider)}});
        pane.popup=child;this.guard(pane,child.webContents,false);
        child.once('closed',()=>{pane.popup=undefined;});
        return child.webContents;
      }};
    });
  }
  private async openExternal(pane:Pane,raw:string) {
    const url=safeWebChatUrl(raw);
    if (!url || pane.pending || !pane.visible || Date.now()-pane.gestureAt>10_000) return;
    pane.gestureAt=0;pane.pending=true;
    // Remove auth query/fragment data from native confirmation and OS browser launches.
    url.search='';url.hash='';
    try {await this.external(pane.owner,url.href);} finally {pane.pending=false;}
  }
  state(owner:WebContents,provider:WebChatProvider,tabId:string,slotId='page'):WebChatState {
    const pane=this.pane(owner,provider,tabId,slotId),history=pane.view.webContents.navigationHistory;
    return {status:pane.status,generation:pane.generation,url:this.checkpoint(pane).url,title:this.checkpoint(pane).title,canGoBack:history.canGoBack(),canGoForward:history.canGoForward()};
  }
  layout(owner:WebContents,provider:WebChatProvider,bounds:WebviewBounds,visible:boolean,radius=0,active=visible,tabId:string,slotId='page',generation=0) {
    const pane=this.pane(owner,provider,tabId,slotId);if(pane.generation!==generation)return;pane.active=active;
    const [width=0,height=0]=pane.window.getContentSize(),zoom=owner.getZoomFactor();
    const x=Math.min(width,Math.round(bounds.x*zoom)),y=Math.min(height,Math.round(bounds.y*zoom));
    pane.view.setBounds({x,y,width:Math.min(width-x,Math.round(bounds.width*zoom)),height:Math.min(height-y,Math.round(bounds.height*zoom))});
    pane.view.setBorderRadius(Math.round(radius*zoom));
    for (const other of this.panes.values()) if(other.owner===owner && other!==pane) {other.active=false;this.visibility(other,false);}
    this.visibility(pane,visible && bounds.width>0 && bounds.height>0);
  }
  private visibility(pane:Pane,visible:boolean) {
    if(visible || pane.visible) nativeTabPool.touch(this.key(pane.owner,pane.tabId,pane.slotId));
    const changed=pane.visible!==visible;pane.visible=visible;pane.view.setVisible(visible);
    if(changed) {if(!visible) pane.popup?.hide();else pane.popup?.show();}
  }
  async action(owner:WebContents,provider:WebChatProvider,action:'back'|'forward'|'reload'|'home'|'focus'|'external'|'discard',tabId:string,slotId='page') {
    if(action==='discard' && !this.panes.has(this.key(owner,tabId,slotId))) {
      const checkpoint=this.checkpoints.get(this.key(owner,tabId,slotId));
      return {status:'ready' as const,generation:0,url:checkpoint?.provider===provider?checkpoint.url:webChatProviders[provider].url,title:checkpoint?.provider===provider?checkpoint.title:'',canGoBack:false,canGoForward:false};
    }
    const pane=this.pane(owner,provider,tabId,slotId),contents=pane.view.webContents,history=contents.navigationHistory;
    if(action==='discard') {const state=this.state(owner,provider,tabId,slotId);this.discard(pane);return state;}
    if(action==='back' && history.canGoBack()) history.goBack();
    if(action==='forward' && history.canGoForward()) history.goForward();
    if(action==='reload') contents.reload();
    if(action==='home') this.load(pane,webChatProviders[provider].url);
    if(action==='focus' && pane.visible) contents.focus();
    if(action==='external') await this.external(owner,webChatProviders[provider].url);
    return this.state(owner,provider,tabId,slotId);
  }
  async clear(owner:WebContents,provider:WebChatProvider) {
    const window=BrowserWindow.fromWebContents(owner);if(!window || this.clearing.has(provider)) return;
    const result=await dialog.showMessageBox(window,{type:'warning',message:tr('web-chat:clear_confirm',{provider:tr(`web-chat:${provider}`)}),detail:tr('web-chat:clear_detail'),buttons:[tr('common:cancel'),tr('web-chat:clear')],defaultId:0,cancelId:0});
    if(result.response!==1 || owner.isDestroyed() || window.isDestroyed() || this.clearing.has(provider)) return;
    this.clearing.add(provider);
    try {
      for(const [key,pane] of this.panes) if(pane.provider===provider) {this.close(pane);this.panes.delete(key);}
      const browser=this.browser(provider);
      await browser.closeAllConnections();await browser.clearStorageData();await browser.clearCache();await browser.cookies.flushStore();
      for(const [key,checkpoint] of this.checkpoints)if(checkpoint.provider===provider)this.checkpoints.delete(key);
      for(const {owner:sender} of this.owners.values()) if(!sender.isDestroyed())sender.send(webChatClearedChannel,provider);
    } finally {this.clearing.delete(provider);}
  }
  private checkpoint(pane:Pane) {
    const url=safeWebChatUrl(pane.view.webContents.getURL());
    if(url) {url.search='';url.hash='';}
    return {tabId:pane.tabId,provider:pane.provider,url:url && url.origin===new URL(webChatProviders[pane.provider].url).origin ? url.href : webChatProviders[pane.provider].url,title:pane.view.webContents.getTitle().slice(0,1000)};
  }
  private discard(pane:Pane) {
    const key=this.key(pane.owner,pane.tabId,pane.slotId);
    if(this.panes.get(key)!==pane)return;
    this.checkpoints.set(key,this.checkpoint(pane));this.panes.delete(key);this.close(pane);
  }
  hide(owner:WebContents,provider:WebChatProvider,tabId:string,slotId:string,generation:number) {
    const pane=this.panes.get(this.key(owner,tabId,slotId));
    if(pane?.provider===provider && pane.generation===generation) {pane.active=false;this.visibility(pane,false);}
  }
  sync(owner:WebContents,tabIds:string[]) {
    this.registerOwner(owner);
    const keep=new Set(tabIds);
    for(const [key,pane] of this.panes) if(pane.owner===owner && !keep.has(pane.tabId)) {this.close(pane);this.panes.delete(key);}
    for(const [key,value] of this.checkpoints) if(key.startsWith(`${owner.id}:`) && !keep.has(value.tabId))this.checkpoints.delete(key);
    return {tabs:[...[...this.panes.values()].filter(p=>p.owner===owner).map(p=>({tabId:p.tabId,status:p.status})),...[...this.checkpoints.entries()].filter(([key,value])=>key.startsWith(`${owner.id}:`) && ![...this.panes.values()].some(p=>p.owner===owner && p.tabId===value.tabId)).map(([,value])=>({tabId:value.tabId,status:'discarded' as const}))]};
  }
  private close(pane:Pane) {
    nativeTabPool.release(this.key(pane.owner,pane.tabId,pane.slotId));
    pane.popup?.destroy();
    if(!pane.window.isDestroyed()) pane.window.contentView.removeChildView(pane.view);
    if(!pane.view.webContents.isDestroyed()) pane.view.webContents.close({waitForBeforeUnload:false});
  }
  private closeOwner(owner:WebContents) {
    for(const [key,pane] of this.panes) if(pane.owner===owner) {this.close(pane);this.panes.delete(key);}
    for(const key of this.checkpoints.keys())if(key.startsWith(`${owner.id}:`))this.checkpoints.delete(key);
    const handlers=this.owners.get(owner.id);if(handlers){owner.removeListener('destroyed',handlers.cleanup);owner.removeListener('did-start-navigation',handlers.navigation);this.owners.delete(owner.id);}
  }
  async dispose() {for(const {owner} of [...this.owners.values()]) this.closeOwner(owner);await Promise.all([...this.sessions.values()].map(browser=>browser.cookies.flushStore()));}
}
