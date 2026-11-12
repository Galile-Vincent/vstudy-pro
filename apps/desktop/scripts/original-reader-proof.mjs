/** Real Electron reader behavior proof. Set UI_SHOTS_OUT. Uses a 30-page PDF, one isolated app, no remote AI. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { launchMarketing } from './marketing-session.mjs';
const out=process.env.UI_SHOTS_OUT;
if(!out)throw Error('Set UI_SHOTS_OUT');
process.env.UI_SHOTS_ORIGINAL_PAGES='30';
await mkdir(out,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'vstudy-original-proof-'));
let session;
try {
 session=await launchMarketing({desktop:resolve(import.meta.dirname,'..'),directory,scale:1});
 const {page}=session;
 for(const mode of ['light','dark']) {
  await session.applyAppearance('vstudy',mode);await session.views['original-page']();
  const root=page.locator('.document-original'),counter=page.getByRole('button',{name:/^Page \d+ of 30$/});
  await page.locator('.original-page[data-page="1"] img').evaluate(el=>el.decode());
  await page.screenshot({path:join(out,`top-${mode}.png`)});
  if(mode==='light') {
   await page.screenshot({path:join(out,'reader-empty-chat-light.png')});
   await page.evaluate(()=>{
    window.proofLoads=[];
    new window.MutationObserver(entries=>{for(const entry of entries)for(const node of entry.addedNodes)if(node instanceof window.HTMLImageElement)window.proofLoads.push(Number(node.closest('[data-page]')?.dataset.page));}).observe(window.document.querySelector('.document-original'),{childList:true,subtree:true});
    const root=window.document.querySelector('.document-original');root.scrollTop=window.document.querySelector('[data-page="30"]').offsetTop;
   });
   await page.locator('.original-page[data-page="30"] img').waitFor();
   const loads=await page.evaluate(()=>window.proofLoads);
   assert.equal(loads[0],30,`Visible page loads first after fast scroll: ${loads}`);
   assert.equal(await page.locator('.original-page').count(),30);
   await page.waitForFunction(()=>!window.document.querySelector('[data-page="1"] img'));
   await page.screenshot({path:join(out,'fast-scroll-page30-light.png')});
   await root.evaluate(el=>{el.scrollTop=0;});
   await page.locator('.original-page[data-page="1"] img').waitFor();
  }
  await root.focus();const before=await root.evaluate(el=>el.scrollTop);await page.keyboard.press('PageDown');await page.waitForFunction(before=>window.document.querySelector('.document-original').scrollTop>before,before);await page.keyboard.press('Home');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop===0);await page.evaluate(()=>new Promise(done=>(window.document.querySelector('.document-original').addEventListener('scrollend',done,{once:true}),window.setTimeout(done,500))));await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop>0);await page.keyboard.press('Home');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop===0);
  const rootBox=await root.boundingBox();await page.mouse.move(rootBox.x+100,rootBox.y+100);
  await page.mouse.wheel(0,1700);
  await page.waitForFunction(()=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()!=='1 / 30');
  const current=Number((await counter.textContent()).split('/')[0]);await page.locator(`.original-page[data-page="${current}"] img`).evaluate(el=>el.decode());
  await page.screenshot({path:join(out,`mid-scroll-${mode}.png`)});
  const jump=async n=>{await counter.click();const input=page.getByRole('spinbutton',{name:'Page',exact:true});await input.fill(String(n));await input.press('Enter');await page.waitForFunction(n=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()===`${n} / 30`,n);await page.locator(`.original-page[data-page="${n}"] img`).evaluate(el=>el.decode());};
  await jump(3);await page.screenshot({path:join(out,`jump-page3-${mode}.png`)});
  await page.getByRole('button',{name:'Capture region',exact:true}).click();
  const box=await page.locator('.original-page[data-page="3"] img').boundingBox();
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+220,box.y+140,{steps:8});await page.screenshot({path:join(out,`capture-page3-${mode}.png`)});await page.mouse.up();
  const chip=page.locator('.document-context-chip').first();await chip.waitFor();assert.match(await chip.textContent(),/· 3/);
  await page.screenshot({path:join(out,`attached-page3-${mode}.png`)});
  await page.getByRole('button',{name:'Remove page attachment'}).first().click();
  await jump(30);await page.getByRole('button',{name:'Parsed text',exact:true}).click();await page.getByRole('button',{name:'Original file',exact:true}).click();await page.waitForFunction(()=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()==='30 / 30');await page.locator('.original-page[data-page="30"] img').evaluate(el=>el.decode());await page.screenshot({path:join(out,`end-${mode}.png`)});
  await page.getByRole('button',{name:'Capture region',exact:true}).click();
  await page.getByRole('button',{name:'Attach page',exact:true}).focus();await page.keyboard.press('Enter');await chip.waitFor();assert.match(await chip.textContent(),/· 30/);
  await page.getByRole('button',{name:'Remove page attachment'}).first().click();
 }
 assert.deepEqual(session.errors,[]);
 await session.page.evaluate(()=>window.dispatchEvent(new window.Event('pagehide')));
 await session.close();session=null;
 const app=await electron.launch({args:[resolve(import.meta.dirname,'..'),`--user-data-dir=${directory}`,'--force-device-scale-factor=1'],env:{...process.env,ELECTRON_RUN_AS_NODE:'',HOME:directory,XDG_CONFIG_HOME:directory,VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 try {
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Page 30 of 30',exact:true}).waitFor();
  await page.locator('.original-page[data-page="30"] img').evaluate(el=>el.decode());
  await page.screenshot({path:join(out,'restored-page30-relaunch.png')});
 } finally {await app.close();}
 await writeFile(join(out,'result.json'),JSON.stringify({status:'pass',pages:30,verified:['wheel scroll updates counter','jump to 3 and 30','fast scroll loads visible page first','distant images evicted','last page survives app relaunch','pointer capture attaches page 3','attach current page 30','light and dark']},null,2));
 console.log(`PASS: original reader proof → ${out}`);
} finally {await session?.close();await rm(directory,{recursive:true,force:true});}
