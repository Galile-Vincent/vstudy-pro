import { Buffer } from 'node:buffer';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory=await mkdtemp(join(tmpdir(),'vstudy-chat-bottom-'));
const evidence='/tmp/vstudy-chat-bottom';await mkdir(evidence,{recursive:true});
let app;
let positions=0, axeScans=0;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();
 const shot=async name=>{
  const base64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await writeFile(join(evidence,name),Buffer.from(base64,'base64'));
 };
 const audit=async()=>{const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.chat-pane').analyze();assert.deepEqual(axe.violations.map(v=>v.id),[]);axeScans++;};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true});});
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
 const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await page.evaluate(documentId=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace',documentId})),doc.id);await page.reload();
 const input=page.locator('.aui-composer-input');await input.waitFor();
 assert.equal(await input.isEditable(),true);
 assert.equal(await page.getByRole('button',{name:'Start a conversation',exact:true}).count(),0);
 const conversations=()=>page.evaluate(documentId=>window.desktop.invoke('conversations:list',{documentId}),doc.id);
 assert.equal((await conversations()).length,1);
 await page.reload();await input.waitFor();assert.equal((await conversations()).length,1,'Reload reuses the existing conversation');
 const checkPosition=async()=>{
  const geometry=await page.locator('.chat-pane').evaluate(pane=>{const shell=pane.querySelector('[data-slot=aui_composer-shell]');const p=pane.getBoundingClientRect(),s=shell.getBoundingClientRect();return {pane:p.toJSON(),composer:s.toJSON(),width:window.innerWidth,height:window.innerHeight};});
  assert.ok(geometry.composer.bottom<=geometry.pane.bottom+1,JSON.stringify(geometry));
  assert.ok(geometry.composer.bottom>=geometry.pane.bottom-120,JSON.stringify(geometry));
  assert.ok(geometry.composer.left>=geometry.pane.left&&geometry.composer.right<=geometry.pane.right+1,JSON.stringify(geometry));
  positions++;
 };
 for(const width of [1200,960,720]) for(const theme of ['light','dark']) {
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  const tab=page.locator('.workspace-tabs').getByRole('tab',{name:'Chat',exact:true});if(await tab.isVisible())await tab.click();
  await checkPosition();await audit();await shot(`${width}-${theme}.png`);
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
 await page.waitForFunction(()=>window.innerWidth<500);
 await page.locator('.workspace-tabs').getByRole('tab',{name:'Chat',exact:true}).click();
 await checkPosition();await audit();await shot('200-percent.png');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,900));
 await input.fill('Explain this document');await input.press('Enter');
 await page.waitForFunction(()=>window.document.querySelector('[data-testid=chat-announcement]')?.textContent?.startsWith('Answer complete'));
 await checkPosition();assert.equal((await conversations()).length,1,'Sending reuses the initial conversation');
 await audit();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',positions,axeScans,axeViolations:0,evidence}));
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
