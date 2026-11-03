import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { migrations,openStore } from '../db';
import { backfillMetadata } from './metadata';
it.each([1,2,3,4,5,6,7,8,9])('upgrades seeded v%s and backfills legacy metadata with missing sources remaining unknown',async(version)=>{
 const root=await mkdtemp(join(tmpdir(),'vstudy-metadata-'));const file=join(root,'test.sqlite');
 const doc=randomUUID(),missing=randomUUID(),conversation=randomUUID(),message=randomUUID();
 try {
  const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)');
  for(const m of migrations.filter(m=>m.version<=version)){db.exec(m.sql);db.prepare('INSERT INTO migrations VALUES(?,?)').run(m.version,new Date().toISOString());}
  await mkdir(join(root,'library'));await writeFile(join(root,'library','source.md'),'source bytes');await writeFile(join(root,'library','content.md'),'<!-- page 1 -->hello');
  for(const id of [doc,missing]) db.prepare('INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'legacy','source.md',id===doc?'a'.repeat(64):'b'.repeat(64),join(root,'library',id===doc?'source.md':'missing.md'),'text/markdown','ready',join(root,'library',id===doc?'content.md':'missing-content.md'),new Date().toISOString());
  db.prepare('INSERT INTO conversations(id,documentId,providerId,modelId,createdAt) VALUES(?,?,?,?,?)').run(conversation,doc,'anthropic-api','fake',new Date().toISOString());
  db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(message,conversation,'user',JSON.stringify([{type:'text',text:'preserved'}]),new Date().toISOString());db.close();
  const store=openStore(file);
  try {
   await backfillMetadata(store.db,join(root,'library'),()=>false,1);
   expect(store.db.prepare('SELECT sizeBytes,contentChars,pageCount FROM documents WHERE id=?').get(doc)).toMatchObject({sizeBytes:12,contentChars:20,pageCount:1});
   expect(store.db.prepare('SELECT sizeBytes,contentChars,pageCount FROM documents WHERE id=?').get(missing)).toMatchObject({sizeBytes:null,contentChars:null,pageCount:null});
   await backfillMetadata(store.db,join(root,'library'),()=>false,1);
   expect(store.messages.list(conversation as never)[0]?.parts[0]?.text).toBe('preserved');
   expect(store.db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');expect(store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {store.close();}
 } finally {await rm(root,{recursive:true,force:true});}
});
