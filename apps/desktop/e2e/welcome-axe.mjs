import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const audits=[];
for(const language of ['en','zh-Hant','ja']){
 const directory=await mkdtemp(join(tmpdir(),'vstudy-axe-'));let app;
 try{
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();await page.locator('.onboarding').waitFor();await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,language});},language);await page.reload();await page.locator('#welcome-entry').click();await page.locator('.welcome').evaluate(e=>e.dataset.testSpotlight='true');
  for(const theme of ['light','dark'])for(const reducedMotion of ['reduce','no-preference']){
   await page.emulateMedia({colorScheme:theme,reducedMotion});await page.waitForTimeout(1500);
   const result=await new AxeBuilder({page}).setLegacyMode(true).include('.welcome').analyze();audits.push({language,theme,reducedMotion,violations:result.violations});
  }
 }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
}
await writeFile('../../docs/evidence/welcome2-axe.json',JSON.stringify(audits,null,2));const severe=audits.flatMap(a=>a.violations.filter(v=>['serious','critical'].includes(v.impact)));console.log(JSON.stringify({audits:audits.length,severe}));assert.deepEqual(severe,[]);
