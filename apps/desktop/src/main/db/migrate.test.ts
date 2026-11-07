/**
 * Regression coverage for db migrate.
 * Owned by main/db.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Every released schema must upgrade without losing existing records or mutating its backup. */
import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate, migrationChecksum } from './migrate';
import { migrations } from './migrations';
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

it.each([false,true])('snapshots a three-migration batch before its first mutation (failure=%s)', fails => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-batch-')), path = join(dir, 'test.sqlite');
  const db = new DatabaseSync(path);
  const first = {version: 1, sql: "CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES('original')"};
  const pending = [
    {version: 2, sql: "UPDATE sentinel SET value='changed'"},
    {version: 3, sql: 'CREATE TABLE added(value TEXT)'},
    {version: 4, sql: fails ? 'INVALID SQL' : 'CREATE TABLE finished(value TEXT)'},
  ];
  try {
    migrate(db, [first]);
    if (fails) expect(() => migrate(db, [first, ...pending], path)).toThrow();
    else migrate(db, [first, ...pending], path);
    expect(readdirSync(dir).filter(name => name.endsWith('.bak'))).toEqual(['test.sqlite.before-v2.bak']);
    expect(db.prepare('SELECT version FROM migrations ORDER BY version').all().map(row => row.version)).toEqual(fails ? [1,2,3] : [1,2,3,4]);
    const backup = new DatabaseSync(path + '.before-v2.bak');
    try {
      expect(backup.prepare('SELECT value FROM sentinel').get()?.value).toBe('original');
      expect(backup.prepare('SELECT version FROM migrations').all()).toEqual([{version:1}]);
      expect(backup.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
      migrate(backup, [first, ...pending.slice(0,2), {version:4,sql:'CREATE TABLE repaired(value TEXT)'}]);
      expect(backup.prepare('SELECT count(*) count FROM migrations').get()?.count).toBe(4);
    } finally { backup.close(); }
  } finally { db.close(); rmSync(dir, {recursive:true,force:true}); }
});

it('keeps the three newest successful batch snapshots and preserves the first snapshot on retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-retention-')), path = join(dir, 'test.sqlite');
  const db = new DatabaseSync(path);
  const history = Array.from({length:6}, (_, i) => ({version:i+1,sql:`CREATE TABLE v${i+1}(value TEXT)`}));
  try {
    migrate(db, history.slice(0,1));
    for (let i=2; i<=6; i++) migrate(db, history.slice(0,i), path);
    expect(readdirSync(dir).filter(name=>name.endsWith('.bak')).sort()).toEqual([4,5,6].map(v=>`test.sqlite.before-v${v}.bak`));
    const snapshot = readFileSync(path+'.before-v6.bak');
    migrate(db,history,path);
    expect(readFileSync(path+'.before-v6.bak')).toEqual(snapshot);
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});
