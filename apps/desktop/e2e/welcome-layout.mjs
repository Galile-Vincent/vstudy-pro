import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const captures=[],frames=[];
for(const language of ['en','zh-Hant','ja']){
 const directory=await mkdtemp(join(tmpdir(),'vstudy-layout-'));let app;
 try{
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.onboarding[data-state=open]').waitFor();
  await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,language});},language);await page.reload();await page.locator('#welcome-entry').click();
  for(const width of [720,900,1200]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);
   for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});
    for(const section of ['hero','demo','who','data']){
     await page.locator(`#welcome-${section}`).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(150);
     assert.ok(await page.locator('.welcome').evaluate(e=>e.scrollWidth<=e.clientWidth));
     if(section==='demo'){
      const alignment=await page.locator('.demo-stage').evaluate(e=>{const heading=e.querySelector('[data-demo-depth="2"]').getBoundingClientRect();const clip=e.querySelector('.w-reader-clip').getBoundingClientRect();return {delta:heading.top-clip.top,toolbarBottom:e.querySelector('.pane-toolbar').getBoundingClientRect().bottom,clipTop:clip.top};});
      assert.ok(Math.abs(alignment.delta)<=5,JSON.stringify({language,width,theme,alignment}));assert.ok(alignment.toolbarBottom<=alignment.clipTop+1);
      const citationVisible=await page.locator('.w-demo-answer').evaluate(e=>{const chip=e.querySelector('.document-citation').getBoundingClientRect(),box=e.getBoundingClientRect();return chip.bottom<=box.bottom+1&&chip.top>=box.top;});assert.ok(citationVisible,`${language}-${width}-${theme} citation clipped`);
     }
     const path=`/tmp/vstudy-welcome2/${language}-${width}-${theme}-${section}.png`;await page.screenshot({path});captures.push({language,width,theme,section,path});
    }
    const copy=JSON.parse(await readFile(`src/shared/locales/${language}/welcome.json`,'utf8'));
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const signature of ['hero','transition']){
     await page.getByRole('button',{name:copy.close,exact:true}).click();await page.locator('#welcome-entry').click();
     const started=Date.now();
     for(let frame=0;frame<12;frame++){
      const path=`/tmp/vstudy-welcome2/${language}-${width}-${theme}-final-${signature}-${String(frame).padStart(2,'0')}.png`;
      await page.screenshot({path});frames.push({language,width,theme,signature,frame,elapsedMs:Date.now()-started,path});await page.waitForTimeout(signature==='hero'?100:25);
     }
    }
    await page.emulateMedia({reducedMotion:'reduce'});
   }
  }
 }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
}
const manifestPath='../../docs/evidence/welcome2-screenshots.json';const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.finalLayoutCaptures=captures;manifest.finalEntranceFrames=frames;await writeFile(manifestPath,JSON.stringify(manifest,null,2));console.log(JSON.stringify({captures:captures.length,frames:frames.length,alignment:'pass'}));
