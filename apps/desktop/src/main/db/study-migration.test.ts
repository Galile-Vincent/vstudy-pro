import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from './migrations';

const at = '2026-11-01T00:00:00.000Z';
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const migration of migrations.filter(m => m.version <= 21)) db.exec(migration.sql);
  db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m',?)").run('chat',at);
  for (const [id,role] of [['user','user'],['assistant','assistant']]) db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!,'chat',role!,'[]',at);
  const migration=migrations.find(m=>m.version===22); expect(migration).toBeDefined(); db.exec(migration!.sql);
  db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run('course','Calculus',at);
  db.prepare('INSERT INTO study_courses(id,title,createdAt) VALUES(?,?,?)').run('other','Physics',at);
  db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey) VALUES('unit','course','manual',0,'Derivatives','unit')").run();
  return db;
}
function job(db:DatabaseSync,id='job',user='user',assistant='assistant',conversation='chat') {
  db.prepare('INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)').run(id,conversation,user,assistant,'v1','course',at,at,at);
}
function observation(db:DatabaseSync,id:string,key:string|null,label:string|null,course='course',unit:string|null=null) {
  return db.prepare("INSERT INTO study_observations(id,jobId,courseId,unitId,conceptKey,proposedLabel,errorType,signal,evidenceQuote,confidence,createdAt) VALUES(?,'job',?,?,?,?,'gap','wrong','wrong attempt',0.9,?)").run(id,course,unit,key,label,at);
}
describe('study migration 22',()=>{
  it('upgrades populated v21 without losing chat data and has sound integrity',()=>{
    const db=fixture();try { expect(db.prepare('SELECT count(*) n FROM messages').get()!.n).toBe(2); expect(db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]); } finally {db.close();}
  });
  it('supports multi-concept jobs and deduplicates proposed labels without NULL holes',()=>{
    const db=fixture();try {job(db);observation(db,'a','chain',null);observation(db,'b','integration',null);observation(db,'c',null,'Limits');expect(()=>observation(db,'d',null,'Limits')).toThrow();expect(()=>observation(db,'e',null,null)).toThrow();expect(db.prepare('SELECT count(*) n FROM study_observations').get()!.n).toBe(3);}finally{db.close();}
  });
  it('rejects cross-course ownership and wrong source message roles or conversations',()=>{
    const db=fixture();try {expect(()=>job(db,'bad','assistant','user')).toThrow();db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES('else','general','p','m',?)").run(at);expect(()=>job(db,'bad','user','assistant','else')).toThrow();job(db);expect(()=>observation(db,'a','chain',null,'other','unit')).toThrow();expect(()=>observation(db,'a','chain',null,'other')).toThrow();}finally{db.close();}
  });
  it.each([['questionSummary','x'.repeat(241)],['attempts',-1]])('rejects invalid %s', (column,value)=>{
    const db=fixture();try {job(db);expect(()=>db.prepare(`UPDATE study_jobs SET ${column}=?`).run(value)).toThrow();}finally{db.close();}
  });
  it('cascades source conversation evidence and course-owned state',()=>{
    const db=fixture();try{job(db);observation(db,'a','chain',null);db.prepare("DELETE FROM conversations WHERE id='chat'").run();expect(db.prepare('SELECT count(*) n FROM study_observations').get()!.n).toBe(0);expect(db.prepare('SELECT count(*) n FROM study_jobs').get()!.n).toBe(0);db.prepare("DELETE FROM study_courses WHERE id='course'").run();expect(db.prepare('SELECT count(*) n FROM study_units').get()!.n).toBe(0);expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);}finally{db.close();}
  });
});
it('Moodle account removal preserves local courses and erases only Moodle chat evidence',()=>{
  const db=fixture();try {
    db.prepare('INSERT INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES(?,?,?,?)').run('account','https://example.edu',1,'{}');
    db.prepare('INSERT INTO moodle_courses(id,accountId,data) VALUES(?,?,?)').run('moodle','account','{}');
    db.prepare("UPDATE study_courses SET moodleCourseId='moodle' WHERE id='course'").run();
    db.prepare("INSERT INTO conversations(id,scope,courseId,providerId,modelId,createdAt) VALUES('moodle-chat','course','moodle','p','m',?)").run(at);
    for(const [id,role] of [['mu','user'],['ma','assistant']])db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!,'moodle-chat',role!,'[]',at);
    job(db);job(db,'moodle-job','mu','ma','moodle-chat');observation(db,'a','chain',null);
    db.prepare("DELETE FROM moodle_accounts WHERE id='account'").run();
    expect(db.prepare("SELECT moodleCourseId FROM study_courses WHERE id='course'").get()!.moodleCourseId).toBeNull();
    expect(db.prepare('SELECT id FROM study_jobs').all()).toEqual([{id:'job'}]);
    expect(db.prepare('SELECT count(*) n FROM study_observations').get()!.n).toBe(1);
    db.prepare("DELETE FROM study_courses WHERE id='course'").run();
    expect(db.prepare('SELECT count(*) n FROM study_observations').get()!.n).toBe(0);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }finally{db.close();}
});
