/** A bounded comparison against committed pre-stream code. No network, Electron, or large result arrays. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
const baseline='8e429e0477ccbd64245e661ff7d64734bb48d2bc';

export async function runStorageBench(root,require){
  const {openStore}=await import('../apps/desktop/src/main/db/index.ts');
  const {LibraryService}=await import('../apps/desktop/src/main/services/library.ts');
  const {MoodleRepository}=await import('../apps/desktop/src/main/moodle/repository.ts');
  const {MoodleResponseCache}=await import('../apps/desktop/src/main/cache/index.ts');
  const {parseCourseIdentity}=await import('../apps/desktop/src/main/moodle/identity.ts');
  const {libraryQuerySchema}=await import('../apps/desktop/src/shared/library.ts');
  const {z}=require('zod');
  const ts=require('typescript');
  async function oldModule(file){
    let source=execFileSync('git',['show',`${process.env.VSTUDY_BENCH_BASE ?? baseline}:${file}`],{cwd:root,encoding:'utf8'});
    source=source.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,specifier)=>{
      if(specifier.startsWith('node:'))return `from '${specifier}'`;
      if(!specifier.startsWith('.'))return `from '${pathToFileURL(require.resolve(specifier)).href}'`;
      const path=resolve(root,dirname(file),specifier),target=[path+'.ts',join(path,'index.ts')].find(existsSync);
      if(!target)throw new Error('Missing baseline dependency '+specifier);
      return `from '${pathToFileURL(target).href}'`;
    });
    const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  }
  const {LibraryService:OldLibrary}=await oldModule('apps/desktop/src/main/services/library.ts');
  const {MoodleRepository:OldMoodle}=await oldModule('apps/desktop/src/main/moodle/repository.ts');
  const directory=mkdtempSync(join(tmpdir(),'vstudy-storage-bench-')),store=openStore(join(directory,'bench.sqlite')),db=store.db;
  const accountId=randomUUID(),courseIds=[],now=new Date().toISOString();let checks=0,requests=0;
  try{
    db.exec('BEGIN');
    const doc=db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,?,?,?,?,'text/markdown','ready',?,?)");
    const fts=db.prepare('INSERT INTO document_fts VALUES(?,?,?,?)');
    for(let i=0;i<10000;i++){
      const id=randomUUID(),hash=i.toString(16).padStart(64,'0');
      doc.run(id,`Document ${i}`,'study.md',hash,join(directory,hash,'source.md'),join(directory,hash,'content.md'),now);
      fts.run(id,`Document ${i}`,'study.md','資料の通信と学習 science '.repeat(40));
    }
    const repository=new MoodleRepository(db);
    repository.saveAccount({id:accountId,siteUrl:'https://school.example',siteName:'School',remoteUserId:1,displayName:'Student',status:'connected',syncedAt:now});
    for(let c=0;c<40;c++){
      const id=randomUUID();courseIds.push(id);
      const course={id,accountId,remoteId:c+1,fullName:`Course ${c}`,shortName:`C${c}`,imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false,identity:parseCourseIdentity(`Course ${c}`,`C${c}`,false)};
      db.prepare('INSERT INTO moodle_courses VALUES(?,?,?)').run(id,accountId,JSON.stringify(course));
      db.prepare('INSERT INTO moodle_course_details VALUES(?,?)').run(id,JSON.stringify({sections:[],announcements:[],refreshedAt:now}));
      for(let f=0;f<40;f++){
        const file={id:randomUUID(),courseId:id,name:`Notes ${f}.pdf`,mime:'application/pdf',size:1024,modifiedAt:now,documentId:null,section:'Week 1',module:'Resources'};
        db.prepare('INSERT INTO moodle_files VALUES(?,?,?,?,NULL)').run(file.id,id,`https://school.example/pluginfile.php/${c}/${f}.pdf`,JSON.stringify(file));
      }
    }
    db.exec('COMMIT; PRAGMA optimize');
    const oldLibrary=new OldLibrary(store,directory),library=new LibraryService(store,directory),oldRepo=new OldMoodle(db);
    const query=libraryQuerySchema.parse({limit:50});
    const results=[];
    const compare=(name,before,after)=>{
      assert.deepEqual(before(),after());
      const samples={before:[],after:[]};
      for(let run=0;run<5;run++)for(const side of ['before','after']){
        const started=performance.now(),value=(side==='before'?before:after)();
        samples[side].push(performance.now()-started);assert.ok(value);checks++;
      }
      const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:sorted[2],minMs:sorted[0],maxMs:sorted.at(-1)};};
      results.push({name,before:summary(samples.before),after:summary(samples.after),runs:5});
    };
    compare('library page with 10k documents',()=>oldLibrary.list(query),()=>library.list(query));
    compare('40-course file inventory with 40 files per course',()=>courseIds.map(id=>oldRepo.fileRecords(id)),()=>courseIds.map(id=>repository.fileRecords(id)));
    compare('40-course detail reads',()=>courseIds.map(id=>oldRepo.course(id)),()=>courseIds.map(id=>repository.course(id)));
    const cache=new MoodleResponseCache(db);const payload=courseIds.map(id=>repository.fileRecords(id));
    const loader=async()=>{requests++;return {status:'modified',value:payload};};
    const cacheRequest={accountId,kind:'courses',key:'40-courses',schema:z.unknown()};
    const coldStarted=performance.now();await Promise.all(Array.from({length:40},()=>cache.get(cacheRequest,loader)));const coldMs=performance.now()-coldStarted;
    const warmStarted=performance.now();await cache.get(cacheRequest,loader);const warmMs=performance.now()-warmStarted;
    assert.equal(requests,1);assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n,10000);assert.equal(repository.overview().courses.length,40);
    assert.equal(store.integrityCheck()[0].integrity_check,'ok');
    const maxRssMiB=process.resourceUsage().maxRSS/1024;assert.ok(maxRssMiB<1024,`RSS ${maxRssMiB} MiB exceeds limit`);
    console.log(JSON.stringify({node:process.version,baseline,shape:{documents:10000,courses:40,filesPerCourse:40,ftsCharactersPerDoc:'資料の通信と学習 science '.repeat(40).length},results,cache:{coldMs,warmMs,concurrentReads:40,networkLoads:requests},checks,failures:0,maxRssMiB,scope:'Warm synchronous repository APIs on disk WAL. Excludes renderer, IPC, network latency, and actual library file reads.'},null,2));
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
}
