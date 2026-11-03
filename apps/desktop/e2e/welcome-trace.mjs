import {_electron as electron} from 'playwright';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-trace-'));let app;
try{
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();await page.locator('.onboarding[data-state=open]').waitFor();await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,language:'en'});});await page.reload();await page.locator('#welcome-entry').waitFor();
 const cdp=await page.context().newCDPSession(page);const events=[];cdp.on('Tracing.dataCollected',e=>events.push(...e.value));await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReportEvents'});
 await page.locator('#welcome-entry').click();await page.waitForTimeout(1800);const completed=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await completed;
 await writeFile('/tmp/vstudy-welcome2/entrance-trace.json',JSON.stringify({traceEvents:events}));
 const renderer=events.find(e=>e.name==='thread_name'&&e.args.name==='CrRendererMain');
 const summary=Object.fromEntries(['UpdateLayoutTree','Layout','Paint','PrePaint','FunctionCall','RunTask'].map(name=>{const f=events.filter(e=>e.name===name&&e.ph==='X'&&e.tid===renderer?.tid);return [name,{count:f.length,totalMs:f.reduce((s,e)=>s+(e.dur??0)/1000,0),maxMs:Math.max(0,...f.map(e=>(e.dur??0)/1000))}]}));await writeFile('../../docs/evidence/welcome2-trace.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
