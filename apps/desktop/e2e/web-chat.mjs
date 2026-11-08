/** Offline native-view acceptance. HTTPS fixture protocol never contacts a real provider. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-web-chat-'));
const evidence=resolve('../../docs/evidence/web-chat');
await mkdir(evidence,{recursive:true});
let app;
const until=async(predicate)=>{const deadline=Date.now()+15000;for(;;){try{if(await predicate())return;}catch{/* View may be opening or clearing. */}if(Date.now()>deadline)throw Error('Timed out waiting for native state');await new Promise(resolve=>setTimeout(resolve,50));}};
const launch=async()=>{
  app=await electron.launch({args:[resolve('.'),'--user-data-dir='+directory],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en'}});
  await app.evaluate(async({session})=>{
    for(const provider of ['gemini','chatgpt','claude']) {
      const browser=session.fromPartition('persist:web-chat-'+provider);
      await browser.protocol.handle('https',()=>new globalThis.Response('<!doctype html><title>Offline chat fixture</title><style>body{font:16px system-ui;padding:36px;background:#f7f7fa;color:#24242b}textarea{display:block;width:80%;height:90px;margin-top:32px}</style><h1>Offline chat fixture</h1><p>Provider session retained in an isolated view.</p><textarea placeholder="Type a conversation"></textarea>',{headers:{'content-type':'text/html'}}));
    }
  });
  return app.firstWindow();
};
try {
  let page=await launch();
  await page.evaluate(()=>window.desktop.invoke('settings:set',{onboardingCompleted:true,welcomeSeen:true}));
  const ids=Array.from({length:5},()=>randomUUID());
  await page.evaluate(ids=>{
    localStorage.setItem('vstudy-tabs-v1',JSON.stringify({version:1,activeId:ids[0],tabs:ids.map((id,index)=>({id,history:{entries:[{view:'hosted-chat',provider:'gemini'}],index:0},title:'Chat '+index,icon:'BookOpen',lastActiveAt:0,presentation:{kind:'app',scrollTop:0}}))}));
  },ids);
  await page.reload();
  const state=id=>page.evaluate(tabId=>window.desktop.invoke('web-chat:state',{provider:'gemini',tabId}),id);
  await until(async()=> (await state(ids[0])).status==='ready');
  const native=()=>app.evaluate(({webContents})=>webContents.getAllWebContents().filter(c=>c.getURL().startsWith('https://gemini.google.com')).map(c=>c.id));
  const first=(await native())[0];
  await app.evaluate(async({webContents,session},id)=>{
    const contents=webContents.fromId(id);
    if(await contents.executeJavaScript('typeof window.desktop')!=='undefined')throw Error('Remote bridge exposed');
    await contents.executeJavaScript('document.querySelector("textarea").value="retained conversation"');
    await session.fromPartition('persist:web-chat-gemini').cookies.set({url:'https://gemini.google.com',name:'fixture_session',value:'persisted',secure:true,expirationDate:Date.now()/1000+3600});
  },first);
  const select=async index=>{await page.locator('#tab-'+ids[index]).click();await until(async()=> (await state(ids[index])).status==='ready');};
  await select(1);
  assert.equal((await native()).length,2);
  await select(0);
  assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('document.querySelector("textarea").value'),first),'retained conversation');
  await app.evaluate(async({webContents},id)=>{await webContents.fromId(id).executeJavaScript('window.open("https://accounts.google.com/login"); void 0',true);},first);
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===2));
  assert.equal(await app.evaluate(({BrowserWindow,session})=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow())?.webContents.session===session.fromPartition('persist:web-chat-gemini')),true);
  await app.evaluate(async({BrowserWindow})=>{const child=BrowserWindow.getAllWindows().find(w=>w.getParentWindow());await child.webContents.executeJavaScript('window.open("https://accounts.google.com/nested"); void 0',true);});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),2);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow())?.destroy());
  for(const index of [2,3,4])await select(index);
  assert.equal((await native()).length,4);
  const statuses=await page.evaluate(tabIds=>window.desktop.invoke('web-chat:sync',{tabIds}),ids);
  assert.equal(statuses.tabs.find(tab=>tab.tabId===ids[1]).status,'discarded');
  await select(1);
  assert.equal((await native()).length,4);
  await page.screenshot({path:join(evidence,'hosted-tabs.png')});
  await page.keyboard.press(process.platform==='darwin'?'Meta+w':'Control+w');
  await until(async()=> (await native()).length===3);
  await app.close();app=undefined;
  page=await launch();await page.reload();
  await until(async()=> (await native()).length===1);
  assert.equal(await page.locator('.app-tabs [role=tab]').count(),4);
  assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:web-chat-gemini').cookies.get({name:'fixture_session'}))[0]?.value),'persisted');
  console.log('PASS hosted tabs have independent views, retain inputs, share provider login, protect OAuth, discard LRU, close, and restore lazily after full restart');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
