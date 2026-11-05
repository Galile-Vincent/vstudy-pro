/**
 * Regression coverage for db chat-migration.
 * Owned by main/db.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import { openStore } from './index';
import { migrations } from './migrations';
it('adds nullable branch links to a version-six database without losing existing messages', () => {
 const directory=mkdtempSync(join(tmpdir(),'vstudy-chat-migration-'));
 const path=join(directory,'db.sqlite');
 try {
  const old=new DatabaseSync(path);
  old.exec('CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)');
  for(const migration of migrations.filter(m=>m.version<=6)) {
   old.exec(migration.sql);old.prepare('INSERT INTO migrations VALUES (?,?)').run(migration.version,'2026-11-03');
  }
  old.exec("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES('d','Study','s.md','hash','/tmp/s.md','text/markdown','ready','/tmp/s.md','2026-11-03'); INSERT INTO conversations(id,documentId,providerId,modelId,createdAt) VALUES('c','d','anthropic-api','fake','2026-11-03'); INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES('m','c','user','[]','2026-11-03');");
  old.close();
  const store=openStore(path);
  expect(store.db.prepare('SELECT id,parentMessageId,supersededBy FROM messages').all()).toEqual([{id:'m',parentMessageId:null,supersededBy:null}]);
  expect(store.integrityCheck()).toEqual([{integrity_check:'ok'}]);
  store.close();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
