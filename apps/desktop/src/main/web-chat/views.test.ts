import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { WebChats } from './views';
const fixture=vi.hoisted(()=>({views:[] as {visible:boolean;webContents:EventEmitter & {closed:boolean;url:string};session:unknown}[],partitions:new Map(),window:{getContentSize:()=>[1000,800],isDestroyed:()=>false,contentView:{addChildView:vi.fn(),removeChildView:vi.fn()}}}));
vi.mock('electron',async()=>{
  const {EventEmitter}=await import('node:events');
  return {
    BrowserWindow:{fromWebContents:()=>fixture.window},dialog:{},
    session:{fromPartition:(key:string)=>{
      if(!fixture.partitions.has(key))fixture.partitions.set(key,Object.assign(new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},cookies:{flushStore:async()=>{}},webRequest:{onBeforeRequest(){}}}));
      return fixture.partitions.get(key);
    }},
    WebContentsView:class {
      visible=false;session:unknown;
      webContents=Object.assign(new EventEmitter(),{closed:false,url:'',navigationHistory:{canGoBack:()=>false,canGoForward:()=>false},getOSProcessId:()=>123,getURL:()=>this.webContents.url,getTitle:()=> 'Fixture',isDestroyed:()=>this.webContents.closed,setWindowOpenHandler(){},loadURL:async(url:string)=>{this.webContents.url=url;this.webContents.emit('did-finish-load');},close:()=>{this.webContents.closed=true;},focus(){}});
      constructor(options:{webPreferences:{session:unknown}}){this.session=options.webPreferences.session;fixture.views.push(this);}
      setVisible(value:boolean){this.visible=value;}setBounds(){}setBorderRadius(){}
    },
  };
});
const owner=(id:number)=>Object.assign(new EventEmitter(),{id,getZoomFactor:()=>1}) as unknown as WebContents;
const tab=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let chats:WebChats;
afterEach(async()=>{await chats.dispose();fixture.views.length=0;});
describe('owned hosted resources',()=>{
  it('reuses a tab and isolates sibling views while sharing provider storage',()=>{
    chats=new WebChats(async()=>{});const sender=owner(1);
    const first=chats.open(sender,'gemini',tab(1));chats.open(sender,'gemini',tab(1));chats.open(sender,'gemini',tab(2));
    expect(fixture.views).toHaveLength(2);expect(fixture.views[0]!.session).toBe(fixture.views[1]!.session);
    expect(()=>chats.state(owner(2),'gemini',tab(1))).toThrow();
    chats.layout(sender,'gemini',{x:0,y:0,width:500,height:500},true,0,true,tab(2),'page',first.generation);
    expect(fixture.views[1]!.visible).toBe(false);
    const current=chats.state(sender,'gemini',tab(2));
    chats.layout(sender,'gemini',{x:0,y:0,width:500,height:500},true,0,true,tab(2),'page',current.generation);
    chats.hide(sender,'gemini',tab(2),'page',first.generation);expect(fixture.views[1]!.visible).toBe(true);
    chats.hide(sender,'gemini',tab(2),'page',current.generation);expect(fixture.views[1]!.webContents.closed).toBe(false);
    chats.sync(sender,[]);expect(fixture.views.every(view=>view.webContents.closed)).toBe(true);
    sender.emit('destroyed');expect(sender.listenerCount('did-start-navigation')).toBe(0);
  });
  it('captures a safe checkpoint and recovers a discarded or crashed tab',async()=>{
    chats=new WebChats(async()=>{});const sender=owner(3);
    chats.open(sender,'gemini',tab(1));fixture.views[0]!.webContents.url='https://gemini.google.com/app/thread?token=secret#secret';
    await chats.action(sender,'gemini','discard',tab(1));
    await chats.action(sender,'gemini','discard',tab(1));
    expect(chats.sync(sender,[tab(1)]).tabs[0]?.status).toBe('discarded');
    chats.open(sender,'gemini',tab(1));expect(fixture.views[1]!.webContents.url).toBe('https://gemini.google.com/app/thread');
    fixture.views[1]!.webContents.emit('render-process-gone');
    chats.open(sender,'gemini',tab(1));expect(fixture.views).toHaveLength(3);
    sender.emit('did-start-navigation',{},'https://app',true,true);expect(fixture.views[2]!.webContents.closed).toBe(false);
    sender.emit('did-start-navigation',{},'https://app',false,true);expect(fixture.views[2]!.webContents.closed).toBe(true);
  });
});
