/** Capture Home, Library, Reader, and Settings chrome in one isolated production Electron instance. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const phase=process.env.ART_PHASE ?? 'round-2';
const evidence=resolve('../../docs/evidence/art/clean',phase);
const directory=await mkdtemp(join(tmpdir(),'vstudy-clean-chrome-'));
const errors=[];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);
  await page.evaluate(id=>window.desktop.invoke('documents:read',{documentId:id}),doc.id);
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const size of [[1200,768],[1440,900]])for(const themeId of ['vstudy','ocean'])for(const colorScheme of ['light','dark']) {
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
    for(const view of ['home','library','workspace']) {
      await page.evaluate(async({view,id,themeId,colorScheme})=>{
        const s=await window.desktop.invoke('settings:get',{});
        await window.desktop.invoke('settings:set',{...s,themeId,colorScheme,language:'en',onboardingCompleted:true,welcomeSeen:true});
        window.localStorage.setItem('vstudy-route',JSON.stringify({view,documentId:id}));
        window.localStorage.setItem('library-grid','true');
        window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['home','library','workspace']}));
      },{view,id:doc.id,themeId,colorScheme});
      await page.reload();
      await page.locator(view==='home'?'.home-reading-card':view==='library'?'.document-card':'.markdown').first().waitFor();
      if(phase!=='before') {
        const header=page.locator(view==='workspace'?'.app-header':'.shell-topbar');
        assert.equal(await header.evaluate(el=>window.getComputedStyle(el).borderBottomWidth),'0px');
        assert.equal(await page.locator('.art-reader-orbit').count(),0);
      }
      await page.screenshot({path:join(evidence,`chrome-${themeId}-${colorScheme}-${view}-${size[0]}.png`),animations:'disabled'});
    }
    await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.getByRole('tab',{name:'Appearance',exact:true}).click();
    await page.locator('.themes-grid').waitFor();
    await page.screenshot({path:join(evidence,`chrome-${themeId}-${colorScheme}-settings-${size[0]}.png`),animations:'disabled'});
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'chrome-verification.json'),JSON.stringify({result:'PASS',artifact:'Built Electron. Local Markdown import. No school or provider connection.',phase,errors},null,2)+'\n');
  console.log('PASS. Home, Library, Reader, and Settings. Two themes, light/dark, 1200x768 and 1440x900.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
