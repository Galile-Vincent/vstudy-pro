import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-ai-parse-'));
const evidence=process.env.VSTUDY_AI_EVIDENCE??'/tmp/vstudy-ai-parse';
await mkdir(evidence,{recursive:true});
let app;
let checks=0, axeScans=0;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,priceOverrides:{fake:{input:2,output:10,cacheRead:0,cacheWrite:0}}});});
 const path=join(directory,'faithful.md');await writeFile(path,'Faithful document text with all facts preserved.');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
 const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await page.evaluate(id=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace',documentId:id})),doc.id);await page.reload();
 await page.getByTestId('document-markdown').waitFor();
 assert.ok(await page.evaluate(async()=> (await window.desktop.invoke('providers:list',{discover:false})).filter(p=>p.config.kind==='cli').every(p=>!p.config.enabled)));checks++;
 await page.getByRole('button',{name:'Improve with AI',exact:true}).first().click();
 const panel=page.locator('.ai-parse-popover');
 assert.equal(await panel.locator('input[type=number]').count(),0);checks++;
 assert.equal(await panel.locator('input[type=checkbox]').count(),0);checks++;
 await panel.getByRole('combobox',{name:'Model',exact:true}).click();
 await page.locator('[data-slot=model-selector-search]').fill('Fixture');
 await page.locator('[data-slot=model-selector-item]').filter({hasText:'Fixture model'}).click();
 assert.match(await panel.getByRole('combobox',{name:'Model',exact:true}).innerText(),/Fixture model/);checks++;
 await panel.getByRole('button',{name:'Estimate cost',exact:true}).click();
 await panel.getByText(/Price unknown/).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Confirm and improve',exact:true}).isEnabled(),true);checks++;
 await panel.getByRole('combobox',{name:'Model',exact:true}).click();
 await page.locator('[data-slot=model-selector-search]').fill('Fake');
 await page.locator('[data-slot=model-selector-item]').filter({hasText:'Fake (test only)'}).click();
 assert.equal(await panel.getByRole('button',{name:'Confirm and improve',exact:true}).isEnabled(),false);checks++;

 await panel.getByRole('button',{name:'Estimate cost',exact:true}).click();
 await panel.getByText(/tokens · USD/).waitFor();checks++;
 const audit=async()=>{const result=await new AxeBuilder({page}).setLegacyMode(true).include('.ai-parse-popover').analyze();await writeFile(join(evidence,'axe.json'),JSON.stringify(result.violations,null,2));assert.deepEqual(result.violations.map(v=>v.id),[]);axeScans++;};
 for(const theme of ['light','dark']) {await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.waitForTimeout(350);await page.screenshot({path:join(evidence,`panel-${theme}.png`)});await audit();}
 await panel.getByRole('button',{name:'Confirm and improve',exact:true}).click();
 await panel.getByText('1 · Done',{exact:true}).waitFor();checks++;
 await panel.getByRole('button',{name:'Use AI version',exact:true}).click();
 await page.locator('.ai-parse-controls button[aria-pressed=true]').filter({hasText:'AI version'}).waitFor();
 assert.equal(await page.getByTestId('document-markdown').locator('strong').innerText(),'Faithful document text with all facts preserved.');checks++;
 await page.getByRole('button',{name:'Original parse',exact:true}).click();
 await page.locator('.ai-parse-controls button[aria-pressed=true]').filter({hasText:'Original parse'}).waitFor();
 assert.equal(await page.getByTestId('document-markdown').locator('strong').count(),0);checks++;
 // Both row menus share the same collision-aware host, including context clicks.
 for(let i=0;i<8;i++) {const p=join(directory,`menu-${i}.md`);await writeFile(p,`Document ${i}`);await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},p);await page.evaluate(()=>window.desktop.invoke('documents:import',{}));}
 await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'library'})));await page.reload();
 await page.locator('.library-document').first().waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,800));
 for(const grid of [false,true]) {
 await page.evaluate(grid=>window.localStorage.setItem('library-grid',String(grid)),grid);await page.reload();await page.locator('.library-document').first().waitFor();
 for(const scale of [1,2]) {
  await page.evaluate(scale=>window.document.documentElement.style.fontSize=`${scale*100}%`,scale);
  for(const rowIndex of [0,-1]) for(const context of [false,true]) {
   const row=rowIndex===0?page.locator('.library-document').first():page.locator('.library-document').last();
   await row.scrollIntoViewIfNeeded();
   if(context)await row.click({button:'right'});else await row.getByRole('button',{name:/Document options:/}).click();
   const menu=page.locator('.anchored-menu');await menu.waitFor();
   const bounds=await menu.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:window.innerWidth,h:window.innerHeight};});
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.w&&bounds.bottom<=bounds.h,JSON.stringify(bounds));
   assert.deepEqual(await menu.locator('[role=menuitem]').evaluateAll(items=>items.filter(el=>el.scrollWidth>el.clientWidth).map(el=>el.textContent)),[]);checks+=2;
   if(rowIndex===-1&&context)await page.screenshot({path:join(evidence,`menu-${grid?'grid':'list'}-${scale}.png`)});
   await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
  }
 }
 }
 await page.evaluate(()=>window.document.documentElement.style.fontSize='200%');
 await page.locator('.library-document').first().getByRole('button',{name:/Document options:/}).click();
 await page.getByRole('menuitem',{name:'Re-parse with AI',exact:true}).click();await panel.waitFor();checks++;await audit();
 await page.screenshot({path:join(evidence,'panel-200-percent.png')});
 for(const [language,title] of [['zh-Hant','用 AI 重新解析'],['ja','AIで再解析']]) {
  await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language});},language);
  await page.reload();await panel.getByRole('heading',{name:title,exact:true}).waitFor();await panel.waitFor();await audit();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,axeScans,axeViolations:0,evidence,liveProviders:0}));
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
