import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrations } from './migrations';
import { validateStudyData } from './study-validation';
function fixture() {const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const migration of migrations)db.exec(migration.sql);return db;}
it('validates an empty migrated store without writing or starting services',()=>{
 const db=fixture();try{const before=db.prepare('SELECT total_changes() n').get()!.n;validateStudyData(db);expect(db.prepare('SELECT total_changes() n').get()!.n).toBe(before);}finally{db.close();}
});
it.each([
 ['aliases',JSON.stringify([123])],['createdAt','not a date'],['id',''],
])('rejects semantically tampered course %s', (column,value)=>{
 const db=fixture();try{db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run('course','Calculus','2026-11-01T00:00:00.000Z');db.prepare(`UPDATE study_courses SET ${column}=?`).run(value);expect(()=>validateStudyData(db)).toThrow();}finally{db.close();}
});
it.each(['{"memoryEnabled":"yes"}','{"memoryEnabled":true,"unknown":1}','null'])('rejects tampered strict study preferences %s',value=>{
 const db=fixture();try{db.prepare("INSERT INTO settings(key,value) VALUES('studyPrefs',?)").run(value);expect(()=>validateStudyData(db)).toThrow();}finally{db.close();}
});
const courseId='11111111-1111-4111-a111-111111111111',artifactId='22222222-2222-4222-a222-222222222222',at='2026-11-01T00:00:00.000Z';
function artifactFixture(db:DatabaseSync){
 db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run(courseId,'Calculus',at);
 db.prepare("INSERT INTO study_artifacts(id,courseId,kind,title,scopeJson,resolvedScopeJson,status,idempotencyKey,attemptToken,bodyMarkdown,providerId,modelId,promptVersion,createdAt) VALUES(?,?,'note','Review',?,?,'ready','request','attempt','Notes','openai-api','model','v1',?)").run(artifactId,courseId,JSON.stringify({kind:'weak'}),JSON.stringify({unitIds:[],documentIds:[],conceptKeys:[],from:null,to:null,timeZone:'UTC',sources:[],assumptions:[]}),at);
}
it('accepts valid ready note payloads without mutating them',()=>{const db=fixture();try{artifactFixture(db);const before=db.prepare('SELECT total_changes() n').get()!.n;validateStudyData(db);expect(db.prepare('SELECT total_changes() n').get()!.n).toBe(before);}finally{db.close();}});
it.each([
 ['scopeJson','{"kind":"weak","injected":true}'],
 ['resolvedScopeJson','{"arbitrary":true}'],
 ['testJson','{"items":[{"answer":"trust me"}]}'],
])('rejects tampered strict artifact %s',(column,value)=>{
 const db=fixture();try{artifactFixture(db);if(column==='testJson')db.prepare("UPDATE study_artifacts SET kind='test',bodyMarkdown=NULL,testJson=?").run(value);else db.prepare(`UPDATE study_artifacts SET ${column}=?`).run(value);expect(()=>validateStudyData(db)).toThrow('storage.invalid_backup');}finally{db.close();}
});
it('rejects scope units owned by a different course',()=>{
 const db=fixture();try{
  artifactFixture(db);const other='33333333-3333-4333-a333-333333333333',unit='44444444-4444-4444-a444-444444444444';
  db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run(other,'Physics',at);
  db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey) VALUES(?,?,'manual',0,'Unit','unit')").run(unit,other);
  db.prepare('UPDATE study_artifacts SET scopeJson=?').run(JSON.stringify({kind:'units',unitIds:[unit]}));
  expect(()=>validateStudyData(db)).toThrow('storage.invalid_backup');
 }finally{db.close();}
});
it('rejects an impossible calendar date in artifact scope',()=>{const db=fixture();try{artifactFixture(db);db.prepare('UPDATE study_artifacts SET scopeJson=?').run(JSON.stringify({kind:'dates',fromDate:'2026-02-31',toDate:'2026-03-15',timeZone:'UTC'}));expect(()=>validateStudyData(db)).toThrow('storage.invalid_backup');}finally{db.close();}});
it('rejects wrong test concepts, unknown answer items and unconfirmed effects',()=>{
 const db=fixture();try{
  artifactFixture(db);const concept='33333333-3333-4333-a333-333333333333',document='44444444-4444-4444-a444-444444444444',attempt='55555555-5555-4555-a555-555555555555',hash='a'.repeat(64);
  db.prepare("INSERT INTO study_concepts(id,courseId,key,label,source,createdAt) VALUES(?,?,'chain','Chain rule','user',?)").run(concept,courseId,at);
  db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Text','text.md',?,'/source.md','text/markdown','ready','/content.md',?)").run(document,hash,at);
  db.prepare('INSERT INTO study_course_documents VALUES(?,?,?)').run(courseId,document,at);
  const source={documentId:document,version:'original',excerptHash:hash};
  db.prepare('UPDATE study_artifacts SET resolvedScopeJson=?').run(JSON.stringify({unitIds:[],documentIds:[document],conceptKeys:['chain'],from:null,to:null,timeZone:'UTC',sources:[source],assumptions:[]}));
  const item={id:'item',conceptKey:'unknown',stem:'Is this true?',explanation:'Explanation',source:{...source,quote:'Source'},type:'true_false',answer:true};
  db.prepare("UPDATE study_artifacts SET kind='test',bodyMarkdown=NULL,testJson=?").run(JSON.stringify({version:1,items:[item]}));expect(()=>validateStudyData(db)).toThrow();
  item.conceptKey='chain';db.prepare('UPDATE study_artifacts SET testJson=?').run(JSON.stringify({version:1,items:[item]}));validateStudyData(db);
  db.prepare("INSERT INTO study_attempts(id,artifactId,phase,answersJson,startedAt) VALUES(?,?,'answering',?,?)").run(attempt,artifactId,'{"unknown":true}',at);expect(()=>validateStudyData(db)).toThrow();
  db.prepare('UPDATE study_attempts SET answersJson=?').run('{"item":true}');validateStudyData(db);
  db.prepare("INSERT INTO study_attempt_items(attemptId,itemId,conceptKey,correct,appliedAt) VALUES(?,'item','chain',1,?)").run(attempt,at);expect(()=>validateStudyData(db)).toThrow();
 }finally{db.close();}
});
it('restores ready historical artifacts after their document is unlinked or deleted',()=>{
 const db=fixture();try{
  artifactFixture(db);const document='44444444-4444-4444-a444-444444444444',unit='55555555-5555-4555-a555-555555555555',hash='a'.repeat(64);
  db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Text','text.md',?,'/source.md','text/markdown','ready','/content.md',?)").run(document,hash,at);
  db.prepare('INSERT INTO study_course_documents VALUES(?,?,?)').run(courseId,document,at);
  db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey) VALUES(?,?,'document',0,'Text',?)").run(unit,courseId,document);
  db.prepare('UPDATE study_artifacts SET scopeJson=?,resolvedScopeJson=?').run(JSON.stringify({kind:'units',unitIds:[unit]}),JSON.stringify({unitIds:[unit],documentIds:[document],conceptKeys:[],from:null,to:null,timeZone:'UTC',sources:[{documentId:document,version:'original',excerptHash:hash}],assumptions:[]}));
  validateStudyData(db);
  db.prepare('DELETE FROM study_course_documents WHERE documentId=?').run(document);
  db.prepare('DELETE FROM study_units WHERE id=?').run(unit);
  expect(()=>validateStudyData(db)).not.toThrow();
  db.prepare('DELETE FROM documents WHERE id=?').run(document);
  expect(()=>validateStudyData(db)).not.toThrow();
 }finally{db.close();}
});
