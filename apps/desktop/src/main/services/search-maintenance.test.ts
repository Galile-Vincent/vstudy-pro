import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SearchService } from './search';

it.each(['missing and duplicate rows', 'corrupt index'])('repairs %s in a disk database through deferred maintenance', async kind => {
  const root = mkdtempSync(join(tmpdir(),'search-maintenance-'));
  const db = new DatabaseSync(join(root,'test.sqlite'));
  const id = '00000000-0000-4000-8000-000000000001';
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,sourceName TEXT,deletedAt TEXT,status TEXT,markdownPath TEXT,activeVersion TEXT,contentChars INTEGER); CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')");
    const path = join(root,'content.md'); writeFileSync(path,'science learning');
    db.prepare("INSERT INTO documents VALUES(?,'Notes','notes.md',NULL,'ready',?,'original',0)").run(id,path);
    const search = new SearchService(db,root);
    if (kind === 'corrupt index') {
      search.update(id,'science learning');
      (db as DatabaseSync & {enableDefensive(enabled: boolean): void}).enableDefensive(false);
      db.exec("UPDATE document_fts_data SET block=x'00' WHERE id>10");
      expect(() => db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')")).toThrow();
    } else {
      db.exec("INSERT INTO document_fts VALUES('orphan','old','old','obsolete')");
    }
    await search.rebuild();
    expect(search.search('science').items.map(row=>row.documentId)).toEqual([id]);
    expect(db.prepare('SELECT count(*) count FROM document_fts').get()?.count).toBe(1);
    search.update(id,'science learning');
    db.prepare('INSERT INTO document_fts SELECT * FROM document_fts WHERE documentId=?').run(id);
    await search.rebuild();
    expect(db.prepare('SELECT count(*) count FROM document_fts').get()?.count).toBe(1);
  } finally { db.close(); rmSync(root,{recursive:true,force:true}); }
});
