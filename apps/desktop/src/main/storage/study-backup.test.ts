import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openStore } from '../db';
import { migrate } from '../db/migrate';
import { migrations } from '../db/migrations';
import { validateStudyData } from '../db/study-validation';
import { exportBackup, stageRestore } from './backup';
import { fingerprint, writeZip } from './zip';
const id='11111111-1111-4111-a111-111111111111',at='2026-11-01T00:00:00.000Z';
async function stagedDb(root:string){const journal=JSON.parse(await readFile(join(root,'restore-pending.json'),'utf8'));return new DatabaseSync(join(root,journal.directory,'vstudy.sqlite'));}
it('stages a populated v21 backup through v22 with no worker startup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'study-v21-')),target=await mkdtemp(join(tmpdir(),'study-target-'));
 try{
  const path=join(root,'vstudy.sqlite'),db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');migrate(db,migrations.filter(m=>m.version<=21));
  db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','openai-api','model',?)").run(id,at);db.close();
  const file={name:'vstudy.sqlite',path,...await fingerprint(path)},manifest=join(root,'manifest.json');
  await writeFile(manifest,JSON.stringify({format:'vstudy-backup',version:1,createdAt:at,files:[{path:file.name,bytes:file.bytes,sha256:file.sha256}]}));
  const archive=join(root,'backup.zip');await writeZip(archive,[file,{name:'manifest.json',path:manifest,...await fingerprint(manifest)}]);
  await stageRestore(target,archive);const restored=await stagedDb(target);
  try {expect(restored.prepare('SELECT MAX(version) version FROM migrations').get()!.version).toBe(22);expect(restored.prepare('SELECT id FROM conversations').get()!.id).toBe(id);validateStudyData(restored);expect(restored.prepare('SELECT count(*) n FROM study_jobs').get()!.n).toBe(0);}finally{restored.close();}
 }finally{await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('round-trips study courses and strict preferences through v22 backup',async()=>{
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
