import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
const round=process.env.VSTUDY_UI2_ROUND??'final',full=round==='final';
const output=`/tmp/vstudy-ui2/${round}`;await mkdir(output,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'ui2-')),screenshots=[],checks=[],errors=[];let app;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true});});await page.reload();
 let context={language:'en',theme:'light',width:1200};
 const shot=async(state)=>{for(const zoom of full?[1,2]:[1]){await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);const path=`${output}/${context.language}-${context.theme}-${context.width}-${state}-${zoom}.png`;await page.screenshot({path,animations:'disabled'});screenshots.push({...context,state,zoom,path});const axe=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']).analyze();const focusContrast=state==='composer-keyboard'?await page.evaluate(()=>{const el=window.document.querySelector('[data-slot=aui_composer-shell]'),style=window.getComputedStyle(el),canvas=window.document.createElement('canvas'),ctx=canvas.getContext('2d'),surface=window.getComputedStyle(window.document.documentElement).getPropertyValue('--surface');const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=surface;ctx.fillRect(0,0,1,1);if(color){ctx.fillStyle=color;ctx.fillRect(0,0,1,1);}return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};const lum=rgb=>rgb.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);const a=lum(rgb()),b=lum(rgb(style.outlineColor));return{color:style.outlineColor,width:style.outlineWidth,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}):undefined;if(focusContrast)assert.ok(focusContrast.ratio>=3,JSON.stringify(focusContrast));checks.push({...context,state,zoom,violations:axe.violations,focusContrast});}await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));};
 await page.locator('.home-page').waitFor();await shot('home-empty');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
 const doc=await page.evaluate(async()=>{const d=await window.desktop.invoke('documents:import',{});return d;});
 await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);await page.evaluate(id=>window.desktop.invoke('documents:read',{documentId:id}),doc.id);
 for(const language of full?['en','zh-Hant','ja']:['en'])for(const theme of ['light','dark'])for(const width of full?[1200,900,720]:[1200,720]) {
  context={language,theme,width};await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  const route=async(view)=>{await page.evaluate(async({language,view,id})=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language,onboardingCompleted:true});window.sessionStorage.setItem('workspace-pane','reading');window.localStorage.setItem('vstudy-route',JSON.stringify({view,documentId:id}));},{language,view,id:doc.id});await page.reload();};
  const db=new DatabaseSync(join(dir,'vstudy.sqlite'));db.exec('PRAGMA busy_timeout=5000; UPDATE documents SET lastOpenedAt=NULL');db.close();
  await route('home');await page.locator('.home-page').waitFor();await page.locator('.home-continue').waitFor({state:'hidden'});await shot('home-empty');
  await page.evaluate(async id=>{await window.desktop.invoke('documents:read',{documentId:id});window.dispatchEvent(new window.Event('activity-updated'));},doc.id);await page.locator('.home-continue').waitFor();await shot('home-populated');
  await page.evaluate(async id=>{await window.desktop.invoke('library:documents:pin',{documentId:id,pinned:true});window.dispatchEvent(new window.Event('activity-updated'));},doc.id);await page.locator('.home-pins').waitFor();await shot('home-pinned');await page.evaluate(async id=>{await window.desktop.invoke('library:documents:pin',{documentId:id,pinned:false});},doc.id);assert.equal(await page.locator('.home-continue h3').count(),1);
  await route('library');await page.locator('.library-document').first().waitFor();await shot('library');
  await page.getByTestId('library-filters').click();await shot('library-filters');await page.getByTestId('library-filters').click();
  await page.locator('.library-toolbar button[aria-pressed]').click();await shot('library-grid');await page.locator('.library-toolbar button[aria-pressed]').click();
  await page.locator('.library-document').first().click({button:'right'});await page.getByRole('menu').waitFor();await shot('library-menu');await page.keyboard.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-dialog').waitFor();await shot('settings');await page.keyboard.press('Escape');await page.locator('.settings-dialog').waitFor({state:'hidden'});
  await route('workspace');await page.locator('.markdown').waitFor();await shot('workspace');if(await page.locator('.workspace-tabs').isVisible())await page.locator('.workspace-tabs button').nth(1).click();
  await page.locator('[data-slot=model-selector-trigger]').first().click();await page.locator('[data-slot=model-selector-search]').fill('Fake');await shot('picker');await page.locator('[data-slot=model-selector-item]').filter({hasText:'Fake'}).first().click();
  const start=page.locator('.chat-start button.primary');if(await start.count())await start.click();
  const input=page.locator('.aui-composer-input');await input.waitFor();await input.blur();await shot('composer-idle');await input.click();await shot('composer-pointer');assert.equal(await page.locator('[data-slot=aui_composer-shell]').evaluate(e=>window.getComputedStyle(e).outlineStyle),'none');assert.equal(await input.evaluate(e=>window.getComputedStyle(e).borderTopWidth),'0px');await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await shot('composer-keyboard');assert.equal(await page.locator('[data-slot=aui_composer-shell]').evaluate(e=>window.getComputedStyle(e).outlineWidth),'2px');
  await route('home');await page.locator('#welcome-entry').click();await page.locator('.welcome').waitFor();await shot('welcome');
  await route('home');await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:false});});await page.reload();await page.locator('.onboarding').waitFor();await shot('onboarding');for(let step=1;step<4;step++){await page.locator('.onboarding footer .primary').click();await shot(`onboarding-${step}`);}
 }
} finally {await mkdir('../../docs/evidence',{recursive:true});await writeFile(`../../docs/evidence/ui2-screenshots${full?'':'-'+round}.json`,JSON.stringify({round,screenshots,checks,errors},null,2)+'\n');await app?.close();await rm(dir,{recursive:true,force:true});}
assert.deepEqual(errors,[]);assert.deepEqual(checks.filter(c=>c.violations.length),[],'axe violations');console.log(`${screenshots.length} screenshots and audits passed`);
