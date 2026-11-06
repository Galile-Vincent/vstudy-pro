import { temporaryPath } from './platform.mjs';
import { Buffer } from 'node:buffer';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {poll} from './poll.mjs';
const source=process.argv[2];assert.ok(source,'Pass the CH2 PDF fixture path');
assert.ok(process.env.VSTUDY_CONVERTER_VENV,'Set VSTUDY_CONVERTER_VENV');
const directory=await mkdtemp(join(tmpdir(),'vstudy-converter-perf-'));let app;const results=[];
try {
 await cp(process.env.VSTUDY_CONVERTER_VENV,join(directory,'converter-venv'),{recursive:true});
 const bytes=await readFile(source);await writeFile(join(directory,'cold.pdf'),bytes);
 // A trailing PDF comment bypasses content-hash deduplication without changing pages.
 await writeFile(join(directory,'warm.pdf'),Buffer.concat([bytes,Buffer.from('\n% vstudy warm benchmark\n')]));
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true});window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}));});await page.reload();await page.getByTestId('bridge-status').waitFor({state:'attached'});
 for(const state of ['cold','warm']) {
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},join(directory,`${state}.pdf`));
  await page.evaluate(()=>{
   window.converterProbe?.observer.disconnect();window.converterProbe?.unsubscribe();
   const previous=window.document.querySelector('[data-testid=document-markdown]');
   const probe=window.converterProbe={start:window.performance.now(),first:null,events:[]};
   probe.unsubscribe=window.desktop.onDocumentProgress(event=>probe.events.push({ms:window.performance.now()-probe.start,...event}));
   probe.observer=new window.MutationObserver(()=>{const current=window.document.querySelector('[data-testid=document-markdown]');if(current && current!==previous && current.textContent && probe.first===null)window.requestAnimationFrame(()=>{if(probe.first===null)probe.first=window.performance.now()-probe.start;});});
   probe.observer.observe(window.document.body,{subtree:true,childList:true,characterData:true});
  });
  await page.getByTestId('import-document').click();
  const doc=await poll(()=>page.evaluate(async name=>(await window.desktop.invoke('documents:list',{})).find(doc=>doc.sourceName===name && doc.status==='ready'),`${state}.pdf`),120_000);
  await page.waitForFunction(()=>window.converterProbe.first!==null);
  const timing=await page.evaluate(()=>({firstPageMs:window.converterProbe.first,readyMs:window.performance.now()-window.converterProbe.start,progress:window.converterProbe.events}));
  const markdown=await page.evaluate(documentId=>window.desktop.invoke('documents:read',{documentId}),doc.id);
  const pageCount=(markdown.match(/<!--\s*page\b/gi)??[]).length;assert.equal(pageCount,18,'CH2 fixture has eighteen pages');
  assert.equal(timing.progress.filter(event=>/^Converting page /.test(event.message)).length,18,'every page emits progress');
  const complete=timing.progress.find(event=>event.message==='Conversion complete');assert.ok(complete && timing.firstPageMs<complete.ms,'first page paints before final conversion');
  results.push({state,converter:doc.converter,pageCount,markdownSha256:createHash('sha256').update(markdown).digest('hex'),...timing});
 }
 assert.equal(results[0].markdownSha256,results[1].markdownSha256,'cold/warm extraction preserves the same Markdown');
 await mkdir(temporaryPath('vstudy-final'),{recursive:true});await writeFile(temporaryPath('vstudy-final/ch2-performance.json'),JSON.stringify({sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.length,results},null,2));console.log(results.map(({progress,...result})=>({...result,progressEvents:progress.length})));
 assert.ok(results[1].firstPageMs<1500,'warm CH2 first page target <1.5 seconds');
 assert.ok(results[1].readyMs<4000,'warm CH2 total target <4 seconds');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
