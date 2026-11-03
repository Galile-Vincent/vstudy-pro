import { performance } from 'node:perf_hooks';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-lifecycle-'));let app;
const workers=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,rss=,command='],{encoding:'utf8'}).split('\n').filter(line=>Number(line.trim().split(/\s+/)[1])===app?.process().pid && line.includes('convert.py --warm-worker'));
try {
 assert.ok(process.env.VSTUDY_CONVERTER_VENV,'Set VSTUDY_CONVERTER_VENV to the locked environment');
 await cp(process.env.VSTUDY_CONVERTER_VENV,join(directory,'converter-venv'),{recursive:true});
 execFileSync('/usr/bin/python3',['test-fixtures/converter/generate.py',join(directory,'fixtures')]);
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();page.setDefaultTimeout(30000);
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,converterIdleMinutes:1});window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}));});await page.reload();await page.getByTestId('bridge-status').waitFor({state:'attached'});
 assert.equal(workers().length,0,'no Python converter at launch');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},join(directory,'fixtures','sample.docx'));
 const start=performance.now();const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await page.getByTestId('document-markdown').waitFor();const firstImportMs=performance.now()-start;
 const running=workers();assert.equal(running.length,1,'one worker after first conversion');
 const workerRssKiB=Number(running[0].trim().split(/\s+/)[2]);
 for(let n=0;n<13;n++) await page.waitForTimeout(5000);assert.equal(workers().length,0,'worker exits after configured idle minute');
 await page.evaluate(documentId=>window.desktop.invoke('documents:reconvert',{documentId}),doc.id);
 await page.waitForFunction(async id=>(await window.desktop.invoke('documents:get',{documentId:id})).status==='ready',doc.id);
 assert.equal(workers().length,1,'conversion restarts after idle shutdown');
 const result={fixture:'generated DOCX',launchWorkers:0,launchPythonRssKiB:0,firstImportMs,workerRssKiB,idleStop:true,restart:true};
 await mkdir('/tmp/vstudy-final',{recursive:true});await writeFile('/tmp/vstudy-final/converter-lifecycle.json',JSON.stringify(result,null,2));console.log(result);
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
