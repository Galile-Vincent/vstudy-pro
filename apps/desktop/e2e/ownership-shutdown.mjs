import { _electron as electron } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { poll } from '../scripts/poll.mjs';
const root=await mkdtemp(join(tmpdir(),'vstudy-ownership-'));let app;
const env={...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'};
const launch=()=>electron.launch({args:[resolve('.'),`--user-data-dir=${root}`],env});
try {
 app=await launch();const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desktop);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
 const second=spawn(app.process().spawnfile,[resolve('.'),`--user-data-dir=${root}`],{env,stdio:'ignore'});
 const [code]=await once(second,'exit');assert.equal(code,0);
 await poll(()=>app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return !w.isMinimized()&&w.isFocused();}));
 const source=join(root,'long.md');await writeFile(source,'study material\n'.repeat(50000));
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 await poll(()=>page.evaluate(async id=>(await window.desktop.invoke('documents:get',{documentId:id})).status==='ready',doc.id));
 await page.evaluate(()=>window.desktop.invoke('providers:configure',{kind:'api',id:'anthropic-api',enabled:true}));
 const conversation=await page.evaluate(documentId=>window.desktop.invoke('conversations:create',{documentId,providerId:'anthropic-api',modelId:'fake'}),doc.id);
 const requestId=randomUUID();
 await page.evaluate(async ({doc,conversation,requestId})=>{
  window.partialStream=new Promise(resolve=>window.desktop.onChatEvent(requestId,event=>{if(event.type==='text-delta')resolve();}));
  await window.desktop.invoke('chat:start',{requestId,documentId:doc.id,conversationId:conversation.id,providerId:'anthropic-api',modelId:'fake',userMessage:'explain'});
  await window.partialStream;
 },{doc,conversation,requestId});
 const mainPid=app.process().pid;
 const descendants=execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)).filter(([,parent])=>parent===mainPid).map(([pid])=>pid);
 const exited=once(app.process(),'exit');await app.evaluate(({app})=>app.quit());await exited;app=undefined;
 const db=new DatabaseSync(join(root,'vstudy.sqlite'));
 const rows=db.prepare("SELECT parts FROM messages WHERE conversationId=? AND role='assistant'").all(conversation.id);db.close();
 assert.equal(rows.length,1);const part=JSON.parse(rows[0].parts)[0];assert.ok(part.text.length>0);assert.equal(part.status,'aborted');assert.ok(part.usage.outputTokens>0);
 app=await launch();await app.firstWindow();
 for(const pid of descendants) {let alive=true;try{process.kill(pid,0);}catch{alive=false;}assert.equal(alive,false,`orphan process ${pid}`);}
 console.log('PASS single-instance focus, quit persistence, restart and child exit');
} finally {await app?.close();await rm(root,{recursive:true,force:true});}
