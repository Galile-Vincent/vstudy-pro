import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';import {tmpdir}from'node:os';import{join,resolve}from'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-welcome-perf-'));let app;const results=[];
try{
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});const page=await app.firstWindow();await page.locator('.onboarding[open]').waitFor();await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,language:'en'});});await page.reload();await page.locator('#welcome-entry').waitFor();
 const measure=async(name,theme,action,duration)=>{
  await page.evaluate(()=>{const p=window.welcomeProbe={frames:[],longFrames:[],scripts:[],shifts:[],last:0,running:true};p.observer=new window.PerformanceObserver(list=>{for(const e of list.getEntries()){if(e.entryType==='long-animation-frame'){p.longFrames.push(e.duration);p.scripts.push(e.scripts?.map(s=>({duration:s.duration,sourceURL:s.sourceURL,invoker:s.invoker})));}if(e.entryType==='layout-shift'&&!e.hadRecentInput)p.shifts.push(e.value);}});p.observer.observe({entryTypes:['long-animation-frame','layout-shift']});const tick=now=>{if(!p.running)return;if(p.last)p.frames.push(now-p.last);p.last=now;window.requestAnimationFrame(tick);};window.requestAnimationFrame(tick);});await action();await page.waitForTimeout(duration);results.push(await page.evaluate(({name,theme})=>{const p=window.welcomeProbe;p.running=false;p.observer.disconnect();const f=p.frames.sort((a,b)=>a-b);return{name,theme,samples:f.length,p95:f[Math.floor(f.length*.95)],longFrames:p.longFrames,scripts:p.scripts,droppedFrames:f.reduce((s,n)=>s+Math.max(0,Math.round(n/(1000/60))-1),0),cls:p.shifts.reduce((a,b)=>a+b,0)};},{name,theme}));
 };
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme,reducedMotion:'no-preference'});await measure('home-baseline',theme,async()=>{},1800);
  await measure('hero',theme,()=>page.locator('#welcome-entry').click(),1600);
  await measure('scroll',theme,()=>page.evaluate(async()=>{const e=window.document.querySelector('.welcome');for(let n=0;n<60;n++){e.scrollTop=(e.scrollHeight-e.clientHeight)*n/59;await new Promise(r=>window.setTimeout(r,50));}}),200);
  await page.locator('#welcome-demo').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await measure('demo',theme,()=>page.getByRole('button',{name:'Replay',exact:true}).click(),11400);
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#welcome-entry').waitFor();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await writeFile('/tmp/vstudy-welcome/performance-both-themes.json',JSON.stringify(results,null,2));await app?.close();await rm(directory,{recursive:true,force:true});}

const failures=results.filter(result=>result.name!=='home-baseline'&&(result.p95>16.7||result.cls!==0||result.longFrames.some(ms=>ms>50)));
assert.deepEqual(failures,[],'Welcome performance budget exceeded; see /tmp/vstudy-welcome/performance-both-themes.json');
