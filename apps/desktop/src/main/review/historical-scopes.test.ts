import {it,expect} from 'vitest';
import {fixture} from './regression-fixture';
import {randomUUID as uuid} from 'node:crypto';
import {validateStudyData} from '../db/study-validation';
it.each(['failed','interrupted','cancelled','ready'] as const)('restores historical %s scopes after unlink including omitted sources',status=>{const f=fixture();try{
 const omitted=uuid();
 f.store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) SELECT ?,title,sourceName,?,sourcePath,mime,status,markdownPath,createdAt FROM documents WHERE id=?").run(omitted,'b'.repeat(64),f.d);
 f.r.linkDocument(f.c.id,omitted);f.snapshot.documentIds.push(omitted);
 const art=f.a.create({...f.request,kind:'note'},f.snapshot,'token');
 if(status==='failed')f.a.fail(art.id,'token','review.provider_failed');
 if(status==='interrupted')f.a.recover();
 if(status==='cancelled')f.a.cancel(art.id);
 if(status==='ready')f.a.finish(art.id,'token',{bodyMarkdown:'Historical note'});
 f.r.unlinkDocument(f.c.id,f.d);f.r.unlinkDocument(f.c.id,omitted);
 expect(()=>validateStudyData(f.store.db)).not.toThrow();
}finally{f.store.close();}});
it('rejects historical references to objects owned by another course',()=>{const f=fixture();try{
 const other=f.r.createCourse({title:'Other'});f.r.unlinkDocument(f.c.id,f.d);f.r.linkDocument(other.id,f.d);
 f.snapshot.unitIds=[];const art=f.a.create({...f.request,kind:'note'},f.snapshot,'token');f.a.fail(art.id,'token','review.provider_failed');
 expect(()=>validateStudyData(f.store.db)).toThrow('storage.invalid_backup');
}finally{f.store.close();}});
it('re-resolves live sources at retry after historical source unlink',async()=>{
 const f=fixture();const {GenerationService}=await import('./generate');const {FakeAdmission}=await import('./admission-port');
 let reads=0,calls=0;
 const service=new GenerationService(f.a,{admission:new FakeAdmission(),readExcerpt:async()=>{reads++;throw Error('unexpected');},estimate:()=>({inputTokens:1,outputTokens:1,costUsd:1}),call:async()=>{calls++;return '';}});
 try {
  const art=f.a.create(f.request,f.snapshot,'token');f.a.fail(art.id,'token','review.provider_failed');f.r.unlinkDocument(f.c.id,f.d);
  service.retry(art.id,uuid(),'en');await service.waitForIdle();
  expect(f.a.find(art.id)?.errorCode).toBe('review.needs_source_selection');expect(reads).toBe(0);expect(calls).toBe(0);
 }finally{await service.dispose();f.store.close();}
});
