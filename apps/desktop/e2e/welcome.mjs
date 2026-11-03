import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence='/tmp/vstudy-welcome2'; await mkdir(evidence,{recursive:true});
const screenshots=[],audits=[],errors=[],checks=[];
const full=process.env.VSTUDY_FULL_MATRIX!=='0';
for(const language of full?['en','zh-Hant','ja']:['en']) {
 const directory=await mkdtemp(join(tmpdir(),'vstudy-welcome-'));let app;
 try {
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  await page.locator('.onboarding[data-state=open]').waitFor();
  await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language,onboardingCompleted:true});},language);
  await page.reload();await page.locator('#welcome-entry').click();await page.locator('.welcome').waitFor();
  const copy=JSON.parse(await readFile(`src/shared/locales/${language}/welcome.json`,'utf8'));
  assert.equal((await page.locator('#welcome-title').textContent()).replaceAll('\u200b', ''),copy.hero_title.replaceAll('\u200b', '').repeat(2));
  assert.equal(await page.locator('.w-content>section').count(),7);
  assert.equal((await page.evaluate(()=>window.desktop.invoke('settings:get',{}))).welcomeSeen,true);
  const capture=async(width,theme,section)=>{await page.locator(`#welcome-${section}`).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(100);const path=`${evidence}/${language}-${width}-${theme}-${section}.png`;await page.screenshot({path});screenshots.push({language,width,theme,section,path});if(section==='hero') {
   const geometry=await page.locator('.hero-stack').evaluate(e=>{const cards=[...e.querySelectorAll('.w-glass')];return cards.slice(0,-1).map((card,i)=>({textBottom:Math.max(...[...card.children].map(c=>c.getBoundingClientRect().bottom)),nextTop:cards[i+1].getBoundingClientRect().top}));});
   assert.ok(geometry.every(g=>g.textBottom<=g.nextTop),JSON.stringify({language,width,theme,geometry}));
  }
  if(section==='who')assert.ok(await page.locator('.w-first strong').evaluateAll(nodes=>nodes.every(n=>parseFloat(window.getComputedStyle(n).fontSize)>= (window.document.documentElement.lang==='en'?12:13))));
  assert.equal(await page.locator('.welcome').evaluate(e=>e.scrollWidth<=e.clientWidth),true,`${language}-${width}-${section} overflow`);};
  for(const width of full?[720,900,1200]:[1200]) {
   await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,900),width);
   for(const theme of full?['light','dark']:['light']) {
    await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    for(const section of ['hero','values','demo','who','models','data','start'])await capture(width,theme,section);
    if (process.env.VSTUDY_ANIMATION_MATRIX === '1') {
      await page.emulateMedia({reducedMotion:'no-preference'});
      for (const signature of ['hero','demo','hover','transition']) {
        if(signature==='hero'||signature==='transition'){await page.getByRole('button',{name:copy.close,exact:true}).click();await page.locator('#welcome-entry').waitFor();await page.locator('#welcome-entry').click();}
        if(signature==='demo'){await page.locator('#welcome-demo').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.getByRole('button',{name:copy.demo_replay,exact:true}).click();}
        if(signature==='hover')await page.locator('#welcome-who').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));
        const started=Date.now();
        for(let frame=0;frame<12;frame++){
          if(signature==='hover'){const box=await page.locator('.w-personas .w-glass').first().boundingBox();await page.mouse.move(box.x+20+frame*8,box.y+40);}
          const path=`${evidence}/${language}-${width}-${theme}-${signature}-frame-${String(frame).padStart(2,'0')}.png`;
          await page.screenshot({path});screenshots.push({language,width,theme,signature,frame,elapsedMs:Date.now()-started,path});await page.waitForTimeout(signature==='demo'?900:signature==='hero'?100:16);
        }
      }
      await page.emulateMedia({reducedMotion:'reduce'});
    }
    await page.locator('.welcome').evaluate(e=>e.dataset.testSpotlight='true');
    if(width===1200)for(const reducedMotion of ['reduce','no-preference']) {
     await page.emulateMedia({reducedMotion});await page.waitForTimeout(1500);const result=await new AxeBuilder({page}).setLegacyMode(true).include('.welcome').analyze();audits.push({language,theme,reducedMotion,violations:result.violations});
    }
    await page.locator('.welcome').evaluate(e=>delete e.dataset.testSpotlight);
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:copy.close,exact:true}).click();await page.locator('#welcome-entry:focus').waitFor();await page.locator('#welcome-entry').click();
  await page.locator('#welcome-demo').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.waitForTimeout(100);
  assert.equal(await page.locator('.demo-stage').getAttribute('data-step'),'highlight');
  assert.equal(await page.locator('.demo-stage').getAttribute('data-playing'),'false');
  for(const theme of ['light','dark']) {
   await page.emulateMedia({colorScheme:theme});await page.evaluate(()=>window.document.documentElement.dataset.reducedTransparency='true');
   assert.equal(await page.locator('.welcome').evaluate(e=>[...e.querySelectorAll('*')].every(n=>window.getComputedStyle(n).backdropFilter==='none')),true);
   await page.locator('#welcome-hero').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await page.screenshot({path:`${evidence}/${language}-${theme}-solid.png`});
  }
  await page.evaluate(()=>delete window.document.documentElement.dataset.reducedTransparency);
  if(language==='en') {
   const measure=async(name,action,duration)=>{
    await page.evaluate(()=>{const p=window.welcomeProbe={frames:[],longFrames:[],shifts:[],last:0,running:true};p.observer=new window.PerformanceObserver(list=>{for(const e of list.getEntries()){if(e.entryType==='long-animation-frame')p.longFrames.push(e.duration);if(e.entryType==='layout-shift'&&!e.hadRecentInput)p.shifts.push(e.value);}});p.observer.observe({entryTypes:['long-animation-frame','layout-shift']});const tick=now=>{if(!p.running)return;if(p.last)p.frames.push(now-p.last);p.last=now;window.requestAnimationFrame(tick);};window.requestAnimationFrame(tick);});
    await action();await page.waitForTimeout(duration);
    return page.evaluate(name=>{const p=window.welcomeProbe;p.running=false;p.observer.disconnect();const f=p.frames.sort((a,b)=>a-b);return {name,samples:f.length,p95:f[Math.floor(f.length*.95)],longFrames:p.longFrames,droppedFrames:f.reduce((s,n)=>s+Math.max(0,Math.round(n/(1000/60))-1),0),cls:p.shifts.reduce((a,b)=>a+b,0)};},name);
   };
   const performance=[];await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
   await page.getByRole('button',{name:copy.close,exact:true}).click();await page.locator('#welcome-entry').waitFor();
   performance.push(await measure('hero',()=>page.locator('#welcome-entry').click(),1600));
   performance.push(await measure('scroll',()=>page.evaluate(async()=>{const e=window.document.querySelector('.welcome');for(let n=0;n<60;n++){e.scrollTop=(e.scrollHeight-e.clientHeight)*n/59;await new Promise(r=>window.setTimeout(r,50));}}),200));
   await page.locator('#welcome-demo').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));
   performance.push(await measure('demo',()=>page.getByRole('button',{name:copy.demo_replay,exact:true}).click(),11600));
   await writeFile(`${evidence}/performance.json`,JSON.stringify(performance,null,2));
   await page.locator('#welcome-start').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(1000);
   checks.push({offscreenPaused:await page.locator('.demo-stage').getAttribute('data-playing')==='false',offscreenRunningAnimations:await page.locator('.welcome').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)});
   await app.evaluate(({app})=>app.getAppMetrics());await page.waitForTimeout(1000);checks.push({idleCpu:await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage})))});
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());await page.waitForTimeout(300);checks.push({hiddenOnNativeHide:await page.locator('.welcome').getAttribute('data-hidden')==='true'});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
   await page.evaluate(()=>{Object.defineProperty(window.document,'hidden',{configurable:true,value:true});window.document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(await page.locator('.welcome').getAttribute('data-hidden'),'true');await page.evaluate(()=>{delete window.document.hidden;window.document.dispatchEvent(new window.Event('visibilitychange'));});
   for(const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});
    for(const signature of ['hero','demo','hover','transition']) {
     if(signature==='hero'||signature==='transition'){await page.getByRole('button',{name:copy.close,exact:true}).click();await page.locator('#welcome-entry').waitFor();await page.locator('#welcome-entry').click();}
     if(signature==='demo'){await page.locator('#welcome-demo').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.getByRole('button',{name:copy.demo_replay,exact:true}).click();}
     if(signature==='hover'){await page.locator('#welcome-who').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.locator('.w-personas .w-glass').first().hover();}
     for(let frame=0;frame<12;frame++){const path=`${evidence}/${theme}-${signature}-${String(frame).padStart(2,'0')}.png`;await page.screenshot({path});screenshots.push({theme,signature,frame,path});await page.waitForTimeout(signature==='demo'?900:25);}
    }
   }
  }
 } finally {await mkdir('../../docs/evidence',{recursive:true});await writeFile('../../docs/evidence/welcome2-screenshots.json',JSON.stringify({screenshots,audits,errors,checks},null,2));await app?.close();await rm(directory,{recursive:true,force:true});}
}
await mkdir('../../docs/evidence',{recursive:true});
await writeFile('../../docs/evidence/welcome2-screenshots.json',JSON.stringify({screenshots,audits,errors,checks},null,2));
const severe=audits.flatMap(a=>a.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({language:a.language,theme:a.theme,motion:a.reducedMotion,id:v.id,nodes:v.nodes.map(n=>n.target)})));
console.log(JSON.stringify({screenshots:screenshots.length,severe,errors,checks},null,2));assert.deepEqual(errors,[]);assert.deepEqual(severe,[]);
