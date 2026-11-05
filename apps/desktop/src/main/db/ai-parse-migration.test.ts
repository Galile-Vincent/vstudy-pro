/**
 * Regression coverage for db ai-parse-migration.
 * Owned by main/db.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations';
it('adds AI versions to a populated version-10 schema without changing original data',()=>{
 const db=new DatabaseSync(':memory:');try {
  db.exec('PRAGMA foreign_keys=ON');for(const migration of migrations.filter(m=>m.version<=10))db.exec(migration.sql);
  db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,?,?,?,?,?,'ready',?,?)").run('seed','資料','source.pdf','a'.repeat(64),'/library/source.pdf','application/pdf','/library/content.md',new Date().toISOString());
  const migration=migrations.find(m=>m.version===11);if(!migration)throw new Error('missing migration');db.exec(migration.sql);
  expect(db.prepare('SELECT activeVersion,title,markdownPath,aiSizeBytes FROM documents WHERE id=?').get('seed')).toEqual({activeVersion:'original',title:'資料',markdownPath:'/library/content.md',aiSizeBytes:null});
  expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
  expect(db.prepare("SELECT count(*) n FROM ai_parse_pages").get()?.n).toBe(0);
 } finally {db.close();}
});
