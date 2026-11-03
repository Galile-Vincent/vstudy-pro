import { createRequire, registerHooks } from 'node:module';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const require=createRequire(join(root,'apps/desktop/package.json'));
const ts=require('typescript');
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(e){if(specifier.startsWith('.')){for(const suffix of ['.ts','/index.ts']){try{return next(specifier+suffix,context);}catch{}}}throw e;}},load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);}});
const {openStore}=await import('../apps/desktop/src/main/db/index.ts');
const {LibraryService}=await import('../apps/desktop/src/main/services/library.ts');
const {getDashboard}=await import('../apps/desktop/src/main/services/dashboard.ts');
const {ActivityService}=await import('../apps/desktop/src/main/services/activity.ts');
const {libraryQuerySchema}=await import('../apps/desktop/src/shared/library.ts');
const dir=process.env.VSTUDY_BENCH_DIR??mkdtempSync(join(tmpdir(),'vstudy-bench-'));mkdirSync(dir,{recursive:true});const store=openStore(join(dir,'bench.sqlite')),db=store.db,library=new LibraryService(store,dir);
const now=new Date().toISOString(),folders=Array.from({length:400},()=>randomUUID()),docs=Array.from({length:5000},()=>randomUUID()),conversations=docs.map(()=>randomUUID());
try{
 const start=performance.now();db.exec('BEGIN');
 const folder=db.prepare('INSERT INTO folders(id,name,position,createdAt,updatedAt) VALUES(?,?,?,?,?)');folders.forEach((id,i)=>folder.run(id,`Folder ${i}`,i,now,now));
 const doc=db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt,folderId,position,lastOpenedAt) VALUES(?,?,?,?,?,'text/markdown','ready',?,?,?,?,?)");
 const conv=db.prepare("INSERT INTO conversations(id,documentId,providerId,modelId,createdAt,updatedAt) VALUES(?,?,'openai-api','bench',?,?)");
 const fts=db.prepare('INSERT INTO document_fts VALUES(?,?,?,?)');
 docs.forEach((id,i)=>{const hash=i.toString(16).padStart(64,'0'),path=join(dir,hash);mkdirSync(path);writeFileSync(join(path,'content.md'),'資料の通信と学習。網路資料 science learning '.repeat(100));doc.run(id,`Document ${i}`,'study.md',hash,join(path,'source.md'),join(path,'content.md'),now,folders[i%400],i,now);conv.run(conversations[i],id,now,now);fts.run(id,`Document ${i}`,'study.md','資料の通信と学習。網路資料 science learning '.repeat(100));});
 const message=db.prepare("INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,'user',?,?)");for(let i=0;i<100000;i++)message.run(randomUUID(),conversations[i%5000],JSON.stringify([{type:'text',text:'Study question'}]),now);
 const usage=db.prepare("INSERT INTO usage_events VALUES(?,?,?,'bench','chat',?,?,NULL,100,50,0,0,0,0.001,'reported',?)");
 for(let i=0;i<1000000;i++){const id=randomUUID(),createdAt=new Date(Date.now()-(i%90)*86400000).toISOString();usage.run(id,createdAt,'openai-api',conversations[i%5000],docs[i%5000],JSON.stringify({id,createdAt,providerId:'openai-api',modelId:'bench',kind:'chat',documentId:docs[i%5000],inputTokens:100,outputTokens:50,costUsd:0.001,costSource:'reported',...(i%1000===0?{rateLimit:{label:'bench',usedPercent:25}}:{})}));}
 db.exec('COMMIT; PRAGMA optimize');console.log(`Seed: ${((performance.now()-start)/1000).toFixed(2)}s; 5000 docs, 400 folders, 100000 messages, 1000000 usage rows`);
 const results=[];function bench(name,budget,fn){fn();const times=[];for(let n=0;n<10;n++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);results.push({query:name,p50_ms:+times[5].toFixed(2),max_ms:+times[9].toFixed(2),budget_ms:budget??'unspecified',pass:budget?times[9]<budget:true});}
 bench('folder page',15,()=>library.list(libraryQuerySchema.parse({folderId:folders[0]})));
 bench('filtered list',15,()=>library.list(libraryQuerySchema.parse({folderId:folders[0],status:'ready',hasChats:true})));
 for(const query of ['science','資料','学習']){bench(`FTS ${query}`,80,()=>library.search.search(query));bench(`Library search ${query}`,80,()=>library.list(libraryQuerySchema.parse({text:query})));}
 bench('dashboard',100,()=>getDashboard(library,new ActivityService(store)));
 bench('document metadata',50,()=>store.documents.get(docs[0]));
 bench('move',null,()=>library.move([docs[0]],folders[1]));
 bench('usage summary rollup',null,()=>store.usage.rollupSummary(now.slice(0,7)+'-01',now.slice(0,10)));
 for (const period of ['day','month','last30days']) bench(`usage summary ${period}`,100,()=>store.usage.summary(period));
 bench('usage dashboard',100,()=>store.usage.dashboard('last30days'));
 bench('usage rate limits',100,()=>store.usage.rateLimits());
 console.table(results);if(results.some(r=>!r.pass))process.exitCode=1;
}finally{store.close();if(!process.env.VSTUDY_BENCH_DIR)rmSync(dir,{recursive:true,force:true});}
