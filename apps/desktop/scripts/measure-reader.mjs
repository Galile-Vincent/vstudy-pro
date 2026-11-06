import { temporaryPath } from './platform.mjs';
import { poll } from './poll.mjs';
import { Buffer } from 'node:buffer';
import { _electron as electron } from 'playwright';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-reader-perf-'));let app;
const fixture=join(directory,'reading.md');
const source=('# Reading fixture\n\nA paragraph for cold first document opening.\n\n').repeat(100);
await writeFile(fixture,source);
async function launch() { app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1'}});return app.firstWindow(); }
try {
 let page=await launch();await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true});});
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},fixture);
 const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await poll(()=>page.evaluate(async id=>(await window.desktop.invoke('documents:get',{documentId:id})).status==='ready',doc.id));
 await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'library'})));await app.close();
 page=await launch();await page.locator('.library-document').first().waitFor();
 const start=await page.evaluate(()=>window.performance.now());
 await page.locator('.library-document').first().press('Enter');await page.getByTestId('document-markdown').waitFor();
 const end=await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>resolve(window.performance.now()))));
 const result={fixtureBytes:Buffer.byteLength(source),coldFirstDocumentOpenMs:end-start,definition:'fresh Electron process, Library Enter to nonempty reader and next rAF; driver latency included; warm filesystem cache; not the original audit corpus'};
 await mkdir(temporaryPath('vstudy-final'),{recursive:true});await writeFile(temporaryPath('vstudy-final/reader-performance.json'),JSON.stringify(result,null,2));console.log(result);
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
