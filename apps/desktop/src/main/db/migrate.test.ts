/** Every released schema must upgrade without losing existing records or mutating its backup. */
import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate, migrationChecksum } from './migrate';
import { migrations } from './index';
it.each(migrations.map(m => m.version))('dry-runs an upgrade from historical version %s', version => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)');
    for (const migration of migrations.filter(m => m.version <= version)) {
      db.exec(migration.sql); db.prepare('INSERT INTO migrations VALUES(?,?)').run(migration.version,'2026-01-01');
    }
    db.prepare('INSERT INTO settings VALUES(?,?)').run('sentinel',JSON.stringify('資料 学習'));
    db.exec("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES('doc','資料 学習','notes.md','hash','/library/source.md','text/markdown','converting','/library/content.md','2026-01-01')");
    const scoped=db.prepare('PRAGMA table_info(conversations)').all().some(row=>row.name==='scope');
    db.exec(scoped ? "INSERT INTO conversations(id,scope,documentId,providerId,modelId,createdAt) VALUES('chat','document','doc','openai-api','test','2026-01-01')" : "INSERT INTO conversations(id,documentId,providerId,modelId,createdAt) VALUES('chat','doc','openai-api','test','2026-01-01')");
    db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run('message','chat','user',JSON.stringify([{type:'text',text:'課業の記録'}]),'2026-01-01');
    migrate(db,migrations);
    expect(db.prepare("SELECT value FROM settings WHERE key='sentinel'").get()?.value).toBe(JSON.stringify('資料 学習'));
    expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT title FROM documents').get()?.title).toBe('資料 学習');
    expect(db.prepare('SELECT scope FROM conversations').get()?.scope).toBe('document');
    expect(JSON.parse(String(db.prepare('SELECT parts FROM messages').get()?.parts))[0].text).toBe('課業の記録');
    expect(db.prepare('SELECT checksum FROM migrations ORDER BY version').all().map(r => r.checksum)).toEqual(migrations.map(m => migrationChecksum(m.sql)));
  } finally {db.close();}
});
it('backs up every migration, rejects edited history, and rolls a failed migration back', () => {
  const dir=mkdtempSync(join(tmpdir(),'vstudy-migrate-')), path=join(dir,'test.sqlite');
  const db=new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode=WAL');
    const first={version:1,sql:"CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES('original');"};
    migrate(db,[first],path);
    const bad={version:2,sql:'ALTER TABLE sentinel ADD COLUMN extra TEXT; INVALID SQL;'};
    expect(() => migrate(db,[first,bad],path)).toThrow();
    expect(existsSync(path+'.before-v1.bak')).toBe(true); expect(existsSync(path+'.before-v2.bak')).toBe(true);
    expect(db.prepare('PRAGMA table_info(sentinel)').all()).toHaveLength(1);
    const backup=new DatabaseSync(path+'.before-v2.bak',{readOnly:true});
    try {expect(backup.prepare('SELECT value FROM sentinel').get()?.value).toBe('original');} finally {backup.close();}
    expect(() => migrate(db,[{...first,sql:first.sql+' SELECT 1;'}],path)).toThrow('checksum mismatch');
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

it('applies every migration through the latest version from an empty database',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');migrate(db,migrations);
    expect(db.prepare('SELECT version,checksum FROM migrations ORDER BY version').all()).toEqual([...migrations].sort((a,b)=>a.version-b.version).map(m=>({version:m.version,checksum:migrationChecksum(m.sql)})));
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
  }finally{db.close();}
});

it('accepts chat history v18 after a pre-merge storage v19 database and restores dependent indexes',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db,migrations.filter(m=>m.version!==18 && m.version<20));
    db.prepare('INSERT INTO settings VALUES(?,?)').run('order',JSON.stringify('retained'));
    migrate(db,migrations);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='conversations_course_page'").get()?.name).toBe('conversations_course_page');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='chat_fts'").get()?.name).toBe('chat_fts');
    expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {db.close();}
});
