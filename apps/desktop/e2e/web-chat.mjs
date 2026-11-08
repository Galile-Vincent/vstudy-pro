/** Offline native-view acceptance. HTTPS fixture protocol never contacts a real provider. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
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
  await page.evaluate(()=>window.desktop.invoke("settings:set",{onboardingCompleted:true}));
  await page.evaluate(()=>localStorage.setItem('vstudy-route',JSON.stringify({view:'ai-chats'})));await page.reload();
  await page.getByRole('tab',{name:'Gemini',exact:true}).click();
  const native=()=>app.evaluate(({webContents})=>webContents.getAllWebContents().filter(c=>['https://gemini.google.com','https://chatgpt.com','https://claude.ai'].some(origin=>c.getURL().startsWith(origin))).map(c=>({id:c.id,url:c.getURL()})));
  await until(()=>page.evaluate(async()=> (await window.desktop.invoke('web-chat:state',{provider:'gemini'})).status==='ready'));
  const first=(await native()).find(c=>c.url.startsWith('https://gemini.google.com'));
  await app.evaluate(async({webContents,session},id)=>{
    const contents=webContents.fromId(id);
    if(await contents.executeJavaScript('typeof window.desktop')!=='undefined') throw Error('Remote bridge exposed');
    await contents.executeJavaScript('document.querySelector("textarea").value="retained conversation"');
    await session.fromPartition('persist:web-chat-gemini').cookies.set({url:'https://gemini.google.com',name:'fixture_session',value:'persisted',expirationDate:Date.now()/1000+3600,secure:true});
  },first.id);
  await page.getByRole('tab',{name:'ChatGPT',exact:true}).click();
  await until(()=>page.evaluate(async()=> (await window.desktop.invoke('web-chat:state',{provider:'chatgpt'})).status==='ready'));
  await page.getByRole('tab',{name:'Gemini',exact:true}).click();
  assert.equal((await native()).find(c=>c.url.startsWith('https://gemini.google.com')).id,first.id);
  assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('document.querySelector("textarea").value'),first.id),'retained conversation');
  assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:web-chat-chatgpt').cookies.get({name:'fixture_session'})).length),0);
  // OAuth keeps its opener and provider partition; nested popups remain denied.
  await app.evaluate(async({webContents},id)=>{await webContents.fromId(id).executeJavaScript('window.open("https://accounts.google.com/login"); void 0',true);},first.id);
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===2));
  assert.equal(await app.evaluate(({BrowserWindow,session})=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow())?.webContents.session===session.fromPartition('persist:web-chat-gemini')),true);
  await app.evaluate(async({BrowserWindow})=>{const child=BrowserWindow.getAllWindows().find(w=>w.getParentWindow());await child.webContents.executeJavaScript('window.open("https://accounts.google.com/nested"); void 0',true);});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),2);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow())?.destroy());
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('[role=dialog]').first().waitFor();
  await page.screenshot({path:join(evidence,'settings-overlay.png')});
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.every(view=>!view.getVisible())));
  await page.locator('[role=dialog]').getByRole('button',{name:'Close settings',exact:true}).click();
  await page.locator('[role=dialog]').waitFor({state:'hidden'});
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.some(view=>view.getVisible())));
  await page.screenshot({path:join(evidence,'gemini.png')});
  const providerImage=await app.evaluate(async({webContents},id)=>(await webContents.fromId(id).capturePage()).toPNG().toString('base64'),first.id);
  await writeFile(join(evidence,'provider-fixture.png'),Buffer.from(providerImage,'base64'));
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.every(view=>!view.getVisible())));
  await page.getByRole('button',{name:'AI chats',exact:true}).click();
  await app.close();app=undefined;
  page=await launch();
  await page.getByRole('tab',{name:'Gemini',exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Gemini',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:web-chat-gemini').cookies.get({name:'fixture_session'}))[0]?.value),'persisted');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});
  await page.getByRole('button',{name:'Clear login/data',exact:true}).click();
  await until(()=>page.evaluate(async()=> (await window.desktop.invoke('web-chat:state',{provider:'gemini'})).status==='ready'));
  assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:web-chat-gemini').cookies.get({name:'fixture_session'})).length),0);
  console.log('PASS: retained views, no remote preload, isolated cookies, restart persistence, selection persistence, clear data, settings overlay screenshots');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
