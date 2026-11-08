/** Main owns persistent, isolated provider views and bounded OAuth child windows. */
import { BrowserWindow, WebContentsView, session, dialog, type Session, type WebContents } from 'electron';
import type { WebChatProvider, WebChatState } from '../../shared/web-chat';
import type { WebviewBounds } from '../../shared/moodle-webview';
import { webChatProviders, webChatNavigation, webChatResource, safeWebChatUrl } from './policy';
import { tr } from '../i18n';
interface Pane { owner:WebContents; window:BrowserWindow; view:WebContentsView; provider:WebChatProvider; status:WebChatState['status']; popup:BrowserWindow|undefined; visible:boolean; pending:boolean; gestureAt:number }
const preferences = {sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,navigateOnDragDrop:false};
export class WebChats {
  private readonly panes=new Map<string,Pane>();
  private readonly sessions=new Map<WebChatProvider,Session>();
  private readonly owners=new Map<number,()=>void>();
  private readonly clearing=new Set<WebChatProvider>();
  constructor(private readonly external:(owner:WebContents,url:string)=>Promise<void>) {}
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
  private key(owner:WebContents,provider:WebChatProvider) { return `${owner.id}:${provider}`; }
  private pane(owner:WebContents,provider:WebChatProvider) {
    const pane=this.panes.get(this.key(owner,provider));
    if (!pane || this.clearing.has(provider)) throw new Error('Web chat unavailable');
    return pane;
  }
  open(owner:WebContents,provider:WebChatProvider):WebChatState {
    if (this.clearing.has(provider)) throw new Error('Web chat clearing');
    const existing=this.panes.get(this.key(owner,provider));
    if (existing) return this.state(owner,provider);
    const window=BrowserWindow.fromWebContents(owner);
    if (!window) throw new Error('Missing owner');
    const view=new WebContentsView({webPreferences:{...preferences,session:this.browser(provider)}});
    const pane:Pane={owner,window,view,provider,status:'loading',popup:undefined,visible:false,pending:false,gestureAt:0};
    this.panes.set(this.key(owner,provider),pane);
    window.contentView.addChildView(view);view.setVisible(false);
    this.guard(pane,view.webContents,true);
    view.webContents.on('did-start-loading',()=>{pane.status='loading';});
    view.webContents.on('did-finish-load',()=>{if(webChatNavigation(provider,view.webContents.getURL())) pane.status='ready';});
    view.webContents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main && code!==-3) pane.status='error';});
    view.webContents.on('render-process-gone',()=>{pane.status='error';view.setVisible(false);});
    if (!this.owners.has(owner.id)) {
      const cleanup=()=>this.closeOwner(owner);
      this.owners.set(owner.id,cleanup);owner.once('destroyed',cleanup);owner.on('did-start-navigation',cleanup);
    }
    this.load(pane,webChatProviders[provider].url);
    return this.state(owner,provider);
  }
  private load(pane:Pane,url:string) {
    pane.status='loading';
    void pane.view.webContents.loadURL(url).catch(()=>{if (!pane.view.webContents.isDestroyed()) pane.status='error';});
  }
  private guard(pane:Pane,contents:WebContents,popups:boolean) {
    contents.on('will-attach-webview',event=>event.preventDefault());
    contents.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown') pane.gestureAt=Date.now();});
    contents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown') pane.gestureAt=Date.now();});
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
  state(owner:WebContents,provider:WebChatProvider):WebChatState {
    const pane=this.pane(owner,provider),history=pane.view.webContents.navigationHistory;
    return {status:pane.status,canGoBack:history.canGoBack(),canGoForward:history.canGoForward()};
  }
  layout(owner:WebContents,provider:WebChatProvider,bounds:WebviewBounds,visible:boolean,radius=0) {
    const pane=this.pane(owner,provider),[width=0,height=0]=pane.window.getContentSize(),zoom=owner.getZoomFactor();
    const x=Math.min(width,Math.round(bounds.x*zoom)),y=Math.min(height,Math.round(bounds.y*zoom));
    pane.view.setBounds({x,y,width:Math.min(width-x,Math.round(bounds.width*zoom)),height:Math.min(height-y,Math.round(bounds.height*zoom))});
    pane.view.setBorderRadius(Math.round(radius*zoom));
    for (const other of this.panes.values()) if(other.owner===owner && other!==pane) this.visibility(other,false);
    this.visibility(pane,visible && bounds.width>0 && bounds.height>0);
  }
  private visibility(pane:Pane,visible:boolean) {
    const changed=pane.visible!==visible;pane.visible=visible;pane.view.setVisible(visible);
    if(changed) {if(!visible) pane.popup?.hide();else pane.popup?.show();}
  }
  async action(owner:WebContents,provider:WebChatProvider,action:'back'|'forward'|'reload'|'home'|'focus'|'external') {
    const pane=this.pane(owner,provider),contents=pane.view.webContents,history=contents.navigationHistory;
    if(action==='back' && history.canGoBack()) history.goBack();
    if(action==='forward' && history.canGoForward()) history.goForward();
    if(action==='reload') contents.reload();
    if(action==='home') this.load(pane,webChatProviders[provider].url);
    if(action==='focus' && pane.visible) contents.focus();
    if(action==='external') await this.external(owner,webChatProviders[provider].url);
    return this.state(owner,provider);
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
    } finally {this.clearing.delete(provider);}
  }
  private close(pane:Pane) {
    pane.popup?.destroy();
    if(!pane.window.isDestroyed()) pane.window.contentView.removeChildView(pane.view);
    if(!pane.view.webContents.isDestroyed()) pane.view.webContents.close({waitForBeforeUnload:false});
  }
  private closeOwner(owner:WebContents) {
    for(const [key,pane] of this.panes) if(pane.owner===owner) {this.close(pane);this.panes.delete(key);}
    const cleanup=this.owners.get(owner.id);if(cleanup){owner.removeListener('destroyed',cleanup);owner.removeListener('did-start-navigation',cleanup);this.owners.delete(owner.id);}
  }
  async dispose() {for(const pane of [...this.panes.values()]) this.closeOwner(pane.owner);await Promise.all([...this.sessions.values()].map(browser=>browser.cookies.flushStore()));}
}
