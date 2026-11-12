/** Real Electron reader behavior proof. Set UI_SHOTS_OUT. Uses an eight-page PDF, one isolated app, no remote AI. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { launchMarketing } from './marketing-session.mjs';
const out=process.env.UI_SHOTS_OUT;
if(!out)throw Error('Set UI_SHOTS_OUT');
process.env.UI_SHOTS_ORIGINAL_PAGES='8';
await mkdir(out,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'vstudy-original-proof-'));
let session;
try {
 session=await launchMarketing({desktop:resolve(import.meta.dirname,'..'),directory,scale:1});
 const {page}=session;
 for(const mode of ['light','dark']) {
  await session.applyAppearance('vstudy',mode);await session.views['original-page']();
  const root=page.locator('.document-original'),counter=page.getByRole('button',{name:'Page',exact:true});
  await page.locator('.original-page[data-page="1"] img').evaluate(el=>el.decode());
  await page.screenshot({path:join(out,`top-${mode}.png`)});
  await root.focus();const before=await root.evaluate(el=>el.scrollTop);await page.keyboard.press('PageDown');await page.waitForFunction(before=>window.document.querySelector('.document-original').scrollTop>before,before);await page.keyboard.press('Home');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop===0);await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop>0);await page.keyboard.press('Home');await page.waitForFunction(()=>window.document.querySelector('.document-original').scrollTop===0);
  const rootBox=await root.boundingBox();await page.mouse.move(rootBox.x+100,rootBox.y+100);
  await page.mouse.wheel(0,1700);
  await page.waitForFunction(()=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()!=='1 / 8');
  const current=Number((await counter.textContent()).split('/')[0]);await page.locator(`.original-page[data-page="${current}"] img`).evaluate(el=>el.decode());
  await page.screenshot({path:join(out,`mid-scroll-${mode}.png`)});
  const jump=async n=>{await counter.click();const input=page.getByRole('spinbutton',{name:'Page',exact:true});await input.fill(String(n));await input.press('Enter');await page.waitForFunction(n=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()===`${n} / 8`,n);await page.locator(`.original-page[data-page="${n}"] img`).evaluate(el=>el.decode());};
  await jump(3);await page.screenshot({path:join(out,`jump-page3-${mode}.png`)});
  await page.getByRole('button',{name:'Capture region',exact:true}).click();
  const box=await page.locator('.original-page[data-page="3"] img').boundingBox();
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+220,box.y+140,{steps:8});await page.screenshot({path:join(out,`capture-page3-${mode}.png`)});await page.mouse.up();
  const chip=page.locator('.document-context-chip').first();await chip.waitFor();assert.match(await chip.textContent(),/· 3/);
  await page.screenshot({path:join(out,`attached-page3-${mode}.png`)});
  await page.getByRole('button',{name:'Remove page attachment'}).first().click();
  await jump(8);await page.getByRole('button',{name:'Parsed text',exact:true}).click();await page.getByRole('button',{name:'Original file',exact:true}).click();await page.waitForFunction(()=>window.document.querySelector('.original-toolbar button')?.textContent?.trim()==='8 / 8');await page.locator('.original-page[data-page="8"] img').evaluate(el=>el.decode());await page.screenshot({path:join(out,`end-${mode}.png`)});
  await page.getByRole('button',{name:'Attach page',exact:true}).click();await chip.waitFor();assert.match(await chip.textContent(),/· 8/);
  await page.getByRole('button',{name:'Remove page attachment'}).first().click();
 }
 assert.deepEqual(session.errors,[]);
 await writeFile(join(out,'result.json'),JSON.stringify({status:'pass',pages:8,verified:['wheel scroll updates counter','jump to 3 and 8','pointer capture attaches page 3','attach current page 8','light and dark']},null,2));
 console.log(`PASS: original reader proof → ${out}`);
} finally {await session?.close();await rm(directory,{recursive:true,force:true});}
