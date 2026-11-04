import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'vstudy-reimport-'));
let app;
try {
 const source = join(directory, 'reimport.md');
 const content = 'A deleted document can be imported again.';
 await writeFile(source, content);
 app = await electron.launch({args:[resolve('.'), `--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1'}});
 const page = await app.firstWindow();
 await page.waitForFunction(()=>!!window.desktop);
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},source);
 const original = await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await page.waitForFunction(async id=>(await window.desktop.invoke('documents:get',{documentId:id}))?.status==='ready',original.id);
 await page.evaluate(documentId=>window.desktop.invoke('library:documents:softDelete',{documentId}),original.id);
 assert.equal(await page.evaluate(documentId=>window.desktop.invoke('documents:get',{documentId}),original.id),null);
 const restored = await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 assert.equal(restored.id,original.id);
 assert.equal(restored.status,'ready');
 assert.equal(await page.evaluate(documentId=>window.desktop.invoke('documents:read',{documentId}),restored.id),content);
 assert.equal((await page.evaluate(()=>window.desktop.invoke('documents:list',{}))).length,1);
 console.log('PASS: native import → Library delete → native re-import restores one readable document with the same identity');
} finally {
 await app?.close();
 await rm(directory,{recursive:true,force:true});
}
