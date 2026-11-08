import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { WebChats } from './views';
const fixture=vi.hoisted(()=>({views:[] as {visible:boolean;webContents:EventEmitter & {closed:boolean;url:string};session:unknown}[],partitions:new Map(),window:{getContentSize:()=>[1000,800],isDestroyed:()=>false,contentView:{addChildView:vi.fn(),removeChildView:vi.fn()}}}));
vi.mock('electron',async()=>{
  const {EventEmitter}=await import('node:events');
  return {
    BrowserWindow:{fromWebContents:()=>fixture.window},dialog:{showMessageBox:async()=>({response:1})},
    session:{fromPartition:(key:string)=>{
      if(!fixture.partitions.has(key))fixture.partitions.set(key,Object.assign(new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},closeAllConnections:async()=>{},clearStorageData:async()=>{},clearCache:async()=>{},cookies:{flushStore:async()=>{}},webRequest:{onBeforeRequest(){}}}));
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
const owner=(id:number)=>Object.assign(new EventEmitter(),{id,isDestroyed:()=>false,send:vi.fn(),getZoomFactor:()=>1}) as unknown as WebContents;
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
it('retries a failed hosted page on ensure',()=>{
 chats=new WebChats(async()=>{});const sender=owner(7);
 chats.open(sender,'gemini',tab(1));fixture.views[0]!.webContents.emit('did-fail-load',{},-105,'','',true);
 expect(chats.state(sender,'gemini',tab(1)).status).toBe('error');
 expect(chats.open(sender,'gemini',tab(1)).status).toBe('ready');
});
it.each(['v','x','Backspace','Delete'])('protects draft edits from eviction for %s and expires protection',async(key)=>{
 vi.useFakeTimers();vi.setSystemTime(1000000);
 try {
 chats=new WebChats(async()=>{});const sender=owner(8);
 chats.open(sender,'gemini',tab(1));
 fixture.views[0]!.webContents.emit('before-input-event',{preventDefault:vi.fn()},{type:'keyDown',key,meta:key.length===1});
 for(let i=2;i<=5;i++)chats.open(sender,'gemini',tab(i));
 expect(fixture.views[0]!.webContents.closed).toBe(false);
 vi.advanceTimersByTime(10*60000+1);
 chats.open(sender,'gemini',tab(6));expect(fixture.views[0]!.webContents.closed).toBe(true);
 } finally {vi.useRealTimers();}
});
it('starts idle time when a used chat is hidden',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000000);
 try {
 const {nativeTabPool}=await import('../native-tab-pool');
 const clock=vi.spyOn(nativeTabPool as unknown as {now:()=>number},'now').mockImplementation(()=>Date.now());
 chats=new WebChats(async()=>{});const sender=owner(9),state=chats.open(sender,'gemini',tab(1));
 chats.layout(sender,'gemini',{x:0,y:0,width:500,height:500},true,0,true,tab(1),'page',state.generation);
 vi.advanceTimersByTime(20*60000);chats.hide(sender,'gemini',tab(1),'page',state.generation);
 nativeTabPool.evaluate([]);expect(fixture.views[0]!.webContents.closed).toBe(false);clock.mockRestore();
 } finally {vi.useRealTimers();}
});
it('does not forward app tab shortcuts from an OAuth child',()=>{
 chats=new WebChats(async()=>{});const sender=Object.assign(owner(10),{send:vi.fn()});chats.open(sender,'gemini',tab(1));
 const child=Object.assign(new EventEmitter(),{setWindowOpenHandler(){}});
 const internals=chats as unknown as {panes:Map<string,unknown>;guard:(pane:unknown,contents:unknown,popups:boolean)=>void};
 internals.guard([...internals.panes.values()][0],child,false);
 child.emit('before-input-event',{preventDefault:vi.fn()},{type:'keyDown',key:'w',meta:true});
 expect(sender.send).not.toHaveBeenCalled();
});
it('returns a resource-limit state when every live draft is protected',()=>{
 chats=new WebChats(async()=>{});const sender=owner(11);
 for(let i=1;i<=4;i++) {chats.open(sender,'gemini',tab(i));fixture.views.at(-1)!.webContents.emit('before-input-event',{preventDefault:vi.fn()},{type:'keyDown',key:'a'});}
 expect(chats.open(sender,'gemini',tab(5)).status).toBe('resource-limit');
});
it('drops cleared provider checkpoints and broadcasts a renderer reset',async()=>{
 chats=new WebChats(async()=>{});const sender=owner(12);
 chats.open(sender,'gemini',tab(1));fixture.views[0]!.webContents.url='https://gemini.google.com/app/old-thread';
 await chats.action(sender,'gemini','discard',tab(1));
 await chats.clear(sender,'gemini');
 expect(sender.send).toHaveBeenCalledWith('web-chat:cleared','gemini');
 chats.open(sender,'gemini',tab(1));expect(fixture.views.at(-1)!.webContents.url).toBe('https://gemini.google.com/app');
});
it('removes owner listeners on dispose after every pane was discarded',async()=>{
 chats=new WebChats(async()=>{});const sender=owner(13);chats.open(sender,'gemini',tab(1));
 await chats.action(sender,'gemini','discard',tab(1));await chats.dispose();
 expect(sender.listenerCount('destroyed')).toBe(0);expect(sender.listenerCount('did-start-navigation')).toBe(0);
});

it('notifies a synced window that never activated a hosted pane when clearing',async()=>{
 chats=new WebChats(async()=>{});const sender=owner(90),restored=owner(91);chats.sync(restored,[tab(1)]);
 await chats.clear(sender,'gemini');expect(restored.send).toHaveBeenCalledWith('web-chat:cleared','gemini');
});
