import { DatabaseSync } from 'node:sqlite';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openStore } from '../db';
import { migrate } from '../db/migrate';
import { migrations } from '../db/migrations';
import { validateStudyData } from '../db/study-validation';
import { exportBackup, recoverRestore, stageRestore } from './backup';
import { ReviewRepository } from '../review/repository';
import { ArtifactRepository } from '../review/artifact-repository';
import { Attempts } from '../review/attempts';
import { deleteAllData } from '../services/delete-data';
import { confirmRestoreStartup } from './restore-startup';
import { randomUUID } from 'node:crypto';
import { fingerprint, writeZip } from './zip';
const id='11111111-1111-4111-a111-111111111111',at='2026-11-01T00:00:00.000Z';
async function stagedDb(root:string){const journal=JSON.parse(await readFile(join(root,'restore-pending.json'),'utf8'));return new DatabaseSync(join(root,journal.directory,'vstudy.sqlite'));}
it('stages a populated v21 backup through the latest schema with no worker startup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'study-v21-')),target=await mkdtemp(join(tmpdir(),'study-target-'));
 try{
  const path=join(root,'vstudy.sqlite'),db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');migrate(db,migrations.filter(m=>m.version<=21));
  db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','openai-api','model',?)").run(id,at);db.close();
  const file={name:'vstudy.sqlite',path,...await fingerprint(path)},manifest=join(root,'manifest.json');
  await writeFile(manifest,JSON.stringify({format:'vstudy-backup',version:1,createdAt:at,files:[{path:file.name,bytes:file.bytes,sha256:file.sha256}]}));
  const archive=join(root,'backup.zip');await writeZip(archive,[file,{name:'manifest.json',path:manifest,...await fingerprint(manifest)}]);
  await stageRestore(target,archive);const restored=await stagedDb(target);
  try {expect(restored.prepare('SELECT MAX(version) version FROM migrations').get()!.version).toBe(Math.max(...migrations.map(m => m.version)));expect(restored.prepare('SELECT id FROM conversations').get()!.id).toBe(id);validateStudyData(restored);expect(restored.prepare('SELECT count(*) n FROM study_jobs').get()!.n).toBe(0);}finally{restored.close();}
 }finally{await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('round-trips study courses and strict preferences through a current-schema backup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'study-v22-')),target=await mkdtemp(join(tmpdir(),'study-target-'));
 const store=openStore(join(root,'vstudy.sqlite'));
 try{
  store.db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run(id,'微積分',at);
  store.db.prepare("INSERT INTO settings(key,value) VALUES('studyPrefs',?)").run(JSON.stringify({memoryEnabled:false,noticeAcknowledged:true,timeZone:'Asia/Taipei'}));
  const archive=join(target,'backup.zip');await exportBackup(store,root,archive);await stageRestore(target,archive);
  const restored=await stagedDb(target);try{expect(restored.prepare('SELECT title FROM study_courses').get()!.title).toBe('微積分');expect(JSON.parse(String(restored.prepare("SELECT value FROM settings WHERE key='studyPrefs'").get()!.value)).memoryEnabled).toBe(false);validateStudyData(restored);}finally{restored.close();}
 }finally{store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('rejects a correctly hashed archive with tampered study payloads before publishing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'study-tamper-')),target=await mkdtemp(join(tmpdir(),'study-target-'));const store=openStore(join(root,'vstudy.sqlite'));
 try{store.db.prepare('INSERT INTO study_courses(id,title,aliases,createdAt) VALUES(?,?,?,?)').run(id,'Calculus','[123]',at);const archive=join(target,'backup.zip');await exportBackup(store,root,archive);await expect(stageRestore(target,archive)).rejects.toThrow('storage.invalid_backup');await expect(readFile(join(target,'restore-pending.json'))).rejects.toThrow();}finally{store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});

it('restores study evidence and confirmed test answers, then deletes all restored data', async () => {
 const root=await mkdtemp(join(tmpdir(),'study-roundtrip-')),target=await mkdtemp(join(tmpdir(),'study-restored-'));
 let source:ReturnType<typeof openStore>|undefined=openStore(join(root,'vstudy.sqlite'));
 let restored:ReturnType<typeof openStore>|undefined;
 try {
  const repo=new ReviewRepository(source.db,()=>Date.parse(at));
  const course=repo.createCourse({title:'Physics'});
  const concept=repo.addConcept({courseId:course.id,label:'Force'});
  const chat=randomUUID(),user=randomUUID(),assistant=randomUUID(),job=randomUUID(),observation=randomUUID();
  source.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','openai-api','gpt-5.4',?)").run(chat,at);
  for(const [messageId,role] of [[user,'user'],[assistant,'assistant']])source.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt,parentMessageId) VALUES(?,?,?,?,?,?)').run(messageId!,chat,role!,JSON.stringify([{type:'text',text:'Force is velocity',status:'complete'}]),at,role==='assistant'?user:null);
  repo.assignChat(chat,course.id);
  source.db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,status,questionSummary,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,1,'succeeded','Why does force change velocity?',?,?,?)").run(job,chat,user,assistant,'v1',course.id,at,at,at);
  source.db.prepare("INSERT INTO study_observations(id,jobId,courseId,conceptKey,errorType,signal,evidenceQuote,confidence,createdAt) VALUES(?,?,?,?,'misconception','wrong','Force is velocity',1,?)").run(observation,job,course.id,concept.key,at);
  const artifacts=new ArtifactRepository(source.db,()=>Date.parse(at));
  const documentId=randomUUID(),excerptHash='a'.repeat(64);
  const artifact=artifacts.create({requestId:randomUUID(),courseId:course.id,kind:'test',title:'Force practice',scope:{kind:'concepts',conceptKeys:[concept.key]},idempotencyKey:randomUUID(),providerId:'openai-api',modelId:'gpt-5.4',locale:'en'},{unitIds:[],documentIds:[documentId],conceptKeys:[concept.key],from:null,to:null,timeZone:'UTC',sources:[{documentId,version:'original',excerptHash}],assumptions:[]},'token');
  artifacts.finish(artifact.id,'token',{test:{version:1,items:[{id:'q1',conceptKey:concept.key,type:'true_false',stem:'Force causes acceleration?',answer:true,explanation:'Newton second law',source:{documentId,version:'original',excerptHash,quote:'Force causes acceleration.'}}]}});
  const attempts=new Attempts(artifacts),attempt=attempts.start(artifact.id);
  attempts.answer(attempt.id,'q1',false);attempts.commit(attempt.id,'q1');const confirmed=attempts.confirm(attempt.id);
  repo.setPrefs({noticeAcknowledged:true,timeZone:'Asia/Taipei'});
  const before=repo.computeCourseMastery(course.id,Date.parse(at));
  validateStudyData(source.db);
  const archive=join(target,'backup.zip');await exportBackup(source,root,archive);source.close();source=undefined;
  await stageRestore(target,archive);
  expect(await recoverRestore(target)).toBe(true);
  restored=openStore(join(target,'vstudy.sqlite'));await confirmRestoreStartup(target);
  const recovered=new ReviewRepository(restored.db);
  expect(recovered.getCourse(course.id)?.title).toBe('Physics');
  expect(recovered.jobsPage({courseId:course.id}).items[0]?.questionSummary).toBe('Why does force change velocity?');
  expect(recovered.observationsPage({courseId:course.id}).items[0]).toMatchObject({id:observation,conceptKey:concept.key,evidenceQuote:'Force is velocity'});
  expect(recovered.computeCourseMastery(course.id,Date.parse(at))).toEqual(before);
  expect(recovered.getPrefs()).toMatchObject({noticeAcknowledged:true,timeZone:'Asia/Taipei'});
  const recoveredAttempts=new Attempts(new ArtifactRepository(restored.db));
  expect(recoveredAttempts.get(attempt.id)).toEqual(confirmed);
  expect(restored.db.prepare('SELECT appliedAt FROM study_attempt_items WHERE attemptId=?').get(attempt.id)?.appliedAt).toBe(at);
  expect(recoveredAttempts.get(attempt.id)).toMatchObject({phase:'confirmed',answers:{q1:false},results:[{itemId:'q1',correct:false,feedback:{answer:true}}]});
  validateStudyData(restored.db);
  let stopped=false;
  await deleteAllData(target,async()=>{restored!.close();restored=undefined;stopped=true;});
  expect(stopped).toBe(true);await expect(access(target)).rejects.toMatchObject({code:'ENOENT'});
 } finally {source?.close();restored?.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
