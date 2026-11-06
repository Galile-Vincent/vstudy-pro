import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { openStore } from '../db';
import { ReviewRepository } from './repository';
import type { MemoryResult } from './memory-repository';
import { MemoryRepository } from './memory-repository';
import { MemoryWorker } from './memory';
import { buildThreadSnapshot } from './thread-snapshot';
const stores: ReturnType<typeof openStore>[] = [];
afterEach(() => stores.splice(0).forEach(s => s.close()));
function fixture() {
 const store=openStore(':memory:');stores.push(store);const repo=new ReviewRepository(store.db);
 const course=repo.createCourse({title:'Physics'}),chat=randomUUID(),user=randomUUID(),assistant=randomUUID(),at=new Date().toISOString();
 store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','openai-api','gpt-6.1-sol',?)").run(chat,at);
 for(const [id,role,text] of [[user,'user','Why force?'],[assistant,'assistant','Force explained']])store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt,parentMessageId) VALUES(?,?,?,?,?,?)').run(id!,chat,role!,JSON.stringify([{type:'text',text,status:'complete'}]),role==='user'?new Date(Date.parse(at)-1).toISOString():at,role==='assistant'?user:null);
 repo.assignChat(chat,course.id);const jobs=new MemoryRepository(store.db);jobs.enqueue(assistant);return {store,repo,jobs,course,chat,user,assistant};
}
const empty:MemoryResult={courseId:null,confidence:1,questionSummary:'A plain question',observations:[]};
it('deduplicates finish, commits zero-concept success once and rejects stale attempt tokens',()=>{
 const f=fixture();f.jobs.enqueue(f.assistant);const job=f.jobs.claim()!;expect(f.jobs.claim()).toBeNull();
 expect(f.jobs.commit(job.id,'stale',{...empty,courseId:f.course.id})).toBe(false);
 expect(f.jobs.commit(job.id,job.attemptToken,{...empty,courseId:f.course.id})).toBe(true);
 expect(f.jobs.commit(job.id,job.attemptToken,{...empty,courseId:f.course.id})).toBe(false);
 expect(f.repo.jobsPage({courseId:f.course.id}).items).toMatchObject([{status:'succeeded',questionSummary:'A plain question'}]);
});
it.each(['opt-out','exclude','reassign','delete','supersede'] as const)('fences %s while remote output is deferred',async action=>{
 const f=fixture();let release!:(v:typeof empty)=>void;const result=new Promise<typeof empty>(resolve=>{release=resolve;});
 const extract=vi.fn(()=>result);const worker=new MemoryWorker(f.jobs,extract);worker.wake();await Promise.resolve();expect(extract).toHaveBeenCalledOnce();
 if(action==='opt-out')f.repo.setPrefs({memoryEnabled:false});
 if(action==='exclude')f.repo.excludeChat(f.chat,true);
 if(action==='reassign')f.repo.assignChat(f.chat,f.repo.createCourse({title:'Math'}).id);
 if(action==='delete')f.store.db.prepare('DELETE FROM conversations WHERE id=?').run(f.chat);
 if(action==='supersede')f.store.db.prepare('UPDATE messages SET supersededBy=? WHERE id=?').run(randomUUID(),f.assistant);
 release({...empty,courseId:f.course.id});await worker.waitForIdle();
 expect(f.store.db.prepare('SELECT * FROM study_observations').all()).toHaveLength(0);
 expect(f.store.db.prepare("SELECT * FROM study_jobs WHERE status='succeeded'").all()).toHaveLength(0);await worker.dispose();
});
it('recovers claims after restart with bounded retries and recovers missed finish inserts',()=>{
 const f=fixture();const job=f.jobs.claim()!;f.jobs.recover();expect(f.jobs.commit(job.id,job.attemptToken,empty)).toBe(false);
 for(let i=0;i<4;i++){f.jobs.claim();f.jobs.recover();}
 expect(f.jobs.claim()).toBeNull();f.store.db.exec('DELETE FROM study_jobs');f.jobs.recover();expect(f.jobs.claim()).not.toBeNull();
});
it('suspends without starting pending network work and fences late completion',async()=>{
 const f=fixture();let release!:()=>void;const extract=vi.fn(async()=>{await new Promise<void>(r=>{release=r;});return {...empty,courseId:f.course.id};});
 const worker=new MemoryWorker(f.jobs,extract);worker.suspend();worker.wake();expect(extract).not.toHaveBeenCalled();worker.resume();await Promise.resolve();worker.suspend();release();await worker.waitForIdle();expect(f.store.db.prepare("SELECT * FROM study_jobs WHERE status='succeeded'").all()).toHaveLength(0);await worker.dispose();
});
it('bounds large history reads and supplies the preceding worked example to yes',()=>{
 const f=fixture();f.store.db.prepare('UPDATE messages SET parts=? WHERE id=?').run(JSON.stringify([{type:'text',text:'yes',status:'complete'}]),f.user);
 const scaffold=randomUUID();f.store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(scaffold,f.chat,'assistant',JSON.stringify([{type:'text',text:'Worked example of force'}]),'2020-01-01T00:00:00.000Z');
 for(let i=0;i<1000;i++)f.store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(randomUUID(),f.chat,'user',JSON.stringify([{type:'text',text:'x'.repeat(500)}]),'2010-01-01T00:00:00.000Z');
 const snapshot=buildThreadSnapshot(f.store.db,f.assistant);expect(snapshot.messages.some(m=>m.text.includes('Worked example'))).toBe(true);expect(snapshot.messages.length).toBeLessThanOrEqual(24);expect(snapshot.bytes).toBeLessThanOrEqual(32768);expect(snapshot.queries).toBeLessThanOrEqual(49);
});
it('rolls observations and success back together at a failed commit and permits restart',()=>{
 const f=fixture();const job=f.jobs.claim()!;
 f.store.db.exec("CREATE TEMP TRIGGER fail_memory BEFORE UPDATE OF status ON study_jobs WHEN NEW.status='succeeded' BEGIN SELECT RAISE(ABORT,'crash'); END;");
 const result:MemoryResult={...empty,courseId:f.course.id,observations:[{unitId:null,conceptKey:null,proposedLabel:'Force',errorType:'none',signal:'asked',evidenceQuote:'Why force?',evidenceKind:'quote',weaknessNote:null,confidence:1,resolved:false,wrongAttempt:false}]};
 expect(()=>f.jobs.commit(job.id,job.attemptToken,result)).toThrow('crash');expect(f.store.db.prepare('SELECT * FROM study_observations').all()).toHaveLength(0);
 f.store.db.exec('DROP TRIGGER fail_memory');f.jobs.recover();const next=f.jobs.claim()!;expect(f.jobs.commit(next.id,next.attemptToken,result)).toBe(true);f.jobs.recover();expect(f.store.db.prepare('SELECT * FROM study_observations').all()).toHaveLength(1);
});
it('preserves attempt fences through supersession and failed branch restoration',()=>{
 const f=fixture();const job=f.jobs.claim()!;
 f.store.db.prepare('UPDATE messages SET supersededBy=? WHERE id=?').run(randomUUID(),f.assistant);
 expect(f.jobs.commit(job.id,job.attemptToken,{...empty,courseId:f.course.id})).toBe(false);
 f.store.db.exec('SAVEPOINT restore_branch');f.store.db.prepare('UPDATE messages SET supersededBy=NULL WHERE id=?').run(f.assistant);f.store.db.exec('ROLLBACK TO restore_branch; RELEASE restore_branch');
 expect(f.jobs.commit(job.id,job.attemptToken,{...empty,courseId:f.course.id})).toBe(false);
});
it('passes real exchange metadata to the provider and commits the persisted summary',async()=>{
 const {ProviderRegistry}=await import('../providers');const {startMemory}=await import('./memory');
 const f=fixture();let input:Record<string,unknown>|undefined;
 const providers=new ProviderRegistry();providers.register('openai-api',{detect:async()=>({available:true}),listModels:async()=>[],async *stream(request){input=JSON.parse(request.prompt.split('<untrusted_data>\n')[1]!.split('\n</untrusted_data>')[0]!) as Record<string,unknown>;yield {type:'text-delta',text:JSON.stringify({schema_version:1,exchange_id:input.exchangeId,chat_id:input.chatId,ts_start:input.startedAt,ts_end:input.endedAt,course:{course_id:f.course.id,confidence:1,source:'attached'},summary:{asked:'Force question',outcome:'Explained'},question_type:'conceptual_why',concepts:[],resolved:'unknown',help_level_used:0,student_wanted_direct:false,tutor_mode:'normal',affect_flag:'none',exclude_from_memory:false})};yield {type:'done'};}});
 const worker=startMemory(f.store,providers);await worker.waitForIdle();await worker.dispose();expect(input?.chatId).toBe(f.chat);expect(f.repo.jobsPage({courseId:f.course.id}).items[0]?.status).toBe('succeeded');
});
it('promotes proposals only after two separated eligible episodes',()=>{
 const f=fixture();const result:MemoryResult={...empty,courseId:f.course.id,observations:[{unitId:null,conceptKey:null,proposedLabel:'Force',errorType:'none',signal:'asked',evidenceQuote:'Why force?',evidenceKind:'quote',weaknessNote:null,confidence:1,resolved:false,wrongAttempt:false}]};
 const first=f.jobs.claim()!;expect(f.jobs.commit(first.id,first.attemptToken,result)).toBe(true);expect(f.repo.listConcepts({courseId:f.course.id}).items).toHaveLength(0);
 const user=randomUUID(),assistant=randomUUID(),at=new Date(Date.now()+86400000).toISOString();for(const [id,role] of [[user,'user'],[assistant,'assistant']])f.store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt,parentMessageId) VALUES(?,?,?,?,?,?)').run(id!,f.chat,role!,JSON.stringify([{type:'text',text:'Why force?',status:'complete'}]),at,role==='assistant'?user:null);
 f.jobs.enqueue(assistant);const next=f.jobs.claim()!;expect(f.jobs.commit(next.id,next.attemptToken,result)).toBe(true);expect(f.repo.listConcepts({courseId:f.course.id}).items).toMatchObject([{source:'promoted',key:'force'}]);expect(f.repo.observationsPage({courseId:f.course.id}).items.every(o=>o.conceptKey==='force')).toBe(true);
});

it('reopens a durable store after pending, claim and committed boundaries without duplicating effects',()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory-restart-'));const path=join(dir,'study.db');
 const seed=fixture();let disk=openStore(path);
 try {
  // Copy a complete valid fixture through SQLite's own backup format.
  disk.close();seed.store.db.prepare('VACUUM INTO ?').run(join(dir,'seed.db'));
  disk=openStore(join(dir,'seed.db'));let jobs=new MemoryRepository(disk.db);
  expect(disk.db.prepare('SELECT status FROM study_jobs').get()?.status).toBe('pending');
  const first=jobs.claim()!;disk.close();disk=openStore(join(dir,'seed.db'));jobs=new MemoryRepository(disk.db);jobs.recover();
  expect(jobs.commit(first.id,first.attemptToken,{...empty,courseId:seed.course.id})).toBe(false);
  const retry=jobs.claim()!;expect(jobs.commit(retry.id,retry.attemptToken,{...empty,courseId:seed.course.id})).toBe(true);
  disk.close();disk=openStore(join(dir,'seed.db'));jobs=new MemoryRepository(disk.db);jobs.recover();expect(jobs.claim()).toBeNull();expect(disk.db.prepare('SELECT count(*) n FROM study_jobs').get()?.n).toBe(1);
 } finally {disk.close();rmSync(dir,{recursive:true,force:true});}
});
it('records zero-concept success for an unclassified eligible exchange',()=>{
 const f=fixture();f.store.db.exec('DELETE FROM study_jobs; DELETE FROM study_chat_links');f.jobs.enqueue(f.assistant);const job=f.jobs.claim()!;expect(f.jobs.commit(job.id,job.attemptToken,empty)).toBe(true);expect(f.store.db.prepare('SELECT status,questionSummary,courseId FROM study_jobs').get()).toMatchObject({status:'succeeded',questionSummary:'A plain question',courseId:null});
});
it('keeps summary deletion fenced against late extraction, retry and recovery',()=>{
 const f=fixture();const job=f.jobs.claim()!;
 f.repo.deleteQuestionSummary(job.id);
 expect(f.jobs.commit(job.id,job.attemptToken,{...empty,courseId:f.course.id})).toBe(false);
 f.jobs.retry(job.id);f.jobs.recover();
 expect(f.jobs.claim()).toBeNull();
 expect(f.repo.jobsPage({courseId:f.course.id}).items).toHaveLength(0);
 expect(f.store.db.prepare('SELECT status,questionSummary FROM study_jobs WHERE id=?').get(job.id)).toMatchObject({status:'skipped',questionSummary:null});
 expect(f.store.db.prepare('SELECT id FROM conversations WHERE id=?').get(f.chat)).toBeDefined();
});
