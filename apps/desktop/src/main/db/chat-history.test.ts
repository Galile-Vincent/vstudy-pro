/**
 * Regression coverage for db chat-history.
 * Owned by main/db.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Search behavior against SQLite, including migration from the shipped v17 schema. */
import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './index';
import { migrations } from './migrations';
import { migrationChecksum } from './migrate';
import { chatSearchSchema } from '../../shared/chat-history';
import { conversationSchema, messageSchema } from '../../shared/domain';
const stores: ReturnType<typeof openStore>[] = [];
afterEach(() => { for (const s of stores.splice(0))
  s.close(); });
function setup() { const s = openStore(':memory:'); stores.push(s); return s; }
function conversation(s: ReturnType<typeof openStore>, text: string, at = '2026-11-01T00:00:00Z') {
  const c = conversationSchema.parse({ id: randomUUID(), scope: 'general', providerId: 'anthropic-api', modelId: 'fake', createdAt: at });
  s.conversations.insert(c);
  const m = messageSchema.parse({ id: randomUUID(), conversationId: c.id, role: 'user', parts: [{ type: 'text', text }], createdAt: at });
  s.messages.insert(m);
  return { c, m };
}
const search = (s: ReturnType<typeof openStore>, q: Record<string, unknown>) => s.chatHistory.search(chatSearchSchema.parse(q));
it('finds English, traditional Chinese, Japanese and emoji using literal queries and safe markers', () => {
  const s = setup();
  const { c } = conversation(s, 'English calculus 繁體中文資料 日本語学習 😀 %_ <img src=x>');
  for (const query of ['calculus', '繁體中文', '資料', '日本語', '学習', '😀', '%_', '<img']) {
    const hits = search(s, { query }).items;
    expect(hits.map(h => h.id)).toEqual([c.id]);
    expect(hits[0]!.matches[0]!.snippet).toContain('[mark]');
  }
  expect(search(s, { query: '" OR *' }).items).toEqual([]);
});
it('ranks titles above message text, groups matches, paginates ties without duplicates', () => {
  const s = setup();
  const { c } = conversation(s, 'rareword');
  const title = conversation(s, 'unrelated');
  s.chatHistory.update(title.c.id, { title: 'rareword' });
  expect(search(s, { query: 'rareword' }).items[0]!.id).toBe(title.c.id);
  for (let i = 0; i < 5; i++)
    conversation(s, 'rareword');
  const ids: string[] = [];
  let page = search(s, { query: 'rareword', limit: 2 });
  for (;;) {
    ids.push(...page.items.map(h => h.id));
    if (!page.nextCursor)
      break;
    page = search(s, { query: 'rareword', limit: 2, cursor: page.nextCursor });
  }
  expect(new Set(ids).size).toBe(7);
  expect(ids).toContain(c.id);
});
it('updates FTS on message edits, superseding, title edits, deletion and cascades', () => {
  const s = setup();
  const { c, m } = conversation(s, 'original');
  s.db.prepare('UPDATE messages SET parts=? WHERE id=?').run(JSON.stringify([{ type: 'text', text: 'replacement' }]), m.id);
  expect(search(s, { query: 'original' }).items).toHaveLength(0);
  expect(search(s, { query: 'replacement' }).items).toHaveLength(1);
  s.db.prepare('UPDATE messages SET supersededBy=? WHERE id=?').run(randomUUID(), m.id);
  expect(search(s, { query: 'replacement' }).items).toHaveLength(0);
  s.chatHistory.update(c.id, { title: 'renamed' });
  expect(search(s, { query: 'renamed' }).items).toHaveLength(1);
  s.chatHistory.update(c.id, { title: 'changed' });
  expect(search(s, { query: 'renamed' }).items).toHaveLength(0);
  s.conversations.delete(c.id);
  expect(s.db.prepare('SELECT * FROM chat_fts').all()).toHaveLength(0);
});
it('combines course, term, scope, role, date, model, pins, archive, document and content flags', () => {
  const s = setup(), courseId = randomUUID(), docId = randomUUID();
  s.db.exec("INSERT INTO moodle_accounts VALUES('a','https://example.edu',1,'{}')");
  s.db.prepare("INSERT INTO moodle_courses VALUES(?,'a',?)").run(courseId, JSON.stringify({ fullName: 'Math', identity: { term: '1151' } }));
  s.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Doc','a.md','hash','/tmp/a','text/markdown','ready','/tmp/a','2026-11-01T00:00:00Z')").run(docId);
  const { c, m } = conversation(s, 'calculus');
  s.db.prepare("UPDATE conversations SET scope='course',courseId=? WHERE id=?").run(courseId, c.id);
  s.chatHistory.update(c.id, { pinned: true });
  const filters = { query: 'calculus', scope: 'courses', courseIds: [courseId], term: '1151', role: 'user', pinned: true, model: 'fake', from: '2026-10-01T00:00:00Z', to: '2026-12-01T00:00:00Z' };
  expect(search(s, filters).items).toHaveLength(1);
  expect(search(s, { ...filters, role: 'assistant' }).items).toHaveLength(0);
  expect(search(s, { ...filters, term: '1142' }).items).toHaveLength(0);
  expect(search(s, { hasCitations: true }).items).toHaveLength(0);
  s.db.prepare('UPDATE messages SET parts=? WHERE id=?').run(JSON.stringify([{ type: 'text', text: 'calculus', selection: { documentId: docId }, citations: [{}] }]), m.id);
  expect(search(s, { hasCitations: true, hasAttachments: true }).items).toHaveLength(1);
  s.chatHistory.update(c.id, { archived: true });
  expect(search(s, {}).items).toHaveLength(0);
  expect(search(s, { archived: true }).items).toHaveLength(1);
  s.chatHistory.update(c.id, { archived: false, deleted: true });
  expect(search(s, {}).items).toHaveLength(0);
  s.chatHistory.update(c.id, { deleted: false });
  expect(search(s, {}).items).toHaveLength(1);
  s.db.prepare("UPDATE conversations SET scope='document',courseId=NULL,documentId=? WHERE id=?").run(docId, c.id);
  expect(search(s, { documentId: docId, scope: 'documents' }).items).toHaveLength(1);
  s.db.prepare('UPDATE documents SET deletedAt=? WHERE id=?').run('2026-11-01', docId);
  expect(search(s, {}).items).toHaveLength(0);
});
it('backfills v17 messages and retains an owner-only backup, links and foreign keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vstudy-history-')), path = join(dir, 'db.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)');
    for (const m of migrations.filter(m => m.version <= 17)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO migrations VALUES(?,?)').run(m.version, '2026-11-01');
    }
    const cid = randomUUID(), mid = randomUUID();
    db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt,courseId) VALUES(?,'course','anthropic-api','fake','2026-11-01T00:00:00Z',?)");
    db.exec("INSERT INTO moodle_accounts VALUES('a','https://example.edu',1,'{}')");
    const courseId = randomUUID();
    db.prepare("INSERT INTO moodle_courses VALUES(?,'a','{}')").run(courseId);
    db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt,courseId) VALUES(?,'course','anthropic-api','fake','2026-11-01T00:00:00Z',?)").run(cid, courseId);
    db.prepare("INSERT INTO messages(id,conversationId,role,parts,createdAt,parentMessageId) VALUES(?,?,'user',?,'2026-11-01T00:00:00Z','parent')").run(mid, cid, JSON.stringify([{ type: 'text', text: '繁體中文学習 calculus' }]));
    db.close();
    const s = openStore(path);
    try {
      expect(search(s, { query: '学習' }).items[0]!.matches[0]!.messageId).toBe(mid);
      expect(s.db.prepare('SELECT parentMessageId FROM messages').get()?.parentMessageId).toBe('parent');
      expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(existsSync(path + '.before-v18.bak')).toBe(true);
      if (process.platform !== 'win32') expect(statSync(path + '.before-v18.bak').mode & 0o777).toBe(0o600);
    }
    finally {
      s.close();
    }
  }
  finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, process.platform === 'win32' ? 120_000 : 5_000);

it('clears a renamed title so future messages can supply its automatic title',()=>{
  const s=setup(),{c}=conversation(s,'Automatic title');
  s.chatHistory.update(c.id,{title:'Renamed'});s.chatHistory.update(c.id,{title:''});
  expect(search(s,{}).items[0]?.title).toBe('Automatic title');
});

it('preserves literal FTS results and ranks when backfilling v24 into v25', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations.filter(m => m.version <= 24)) db.exec(migration.sql);
    const cid = randomUUID(), mid = randomUUID(), hidden = randomUUID();
    db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt,title) VALUES(?,'general','anthropic-api','fake','2026-11-01','calculus 資料')").run(cid);
    const insert = db.prepare("INSERT INTO messages(id,conversationId,role,parts,createdAt,supersededBy) VALUES(?,?,'user',?,'2026-11-01',?)");
    insert.run(mid, cid, JSON.stringify([{ type: 'text', text: 'calculus 資料 😀' }]), null);
    insert.run(hidden, cid, JSON.stringify([{ type: 'text', text: 'hidden calculus' }]), mid);
    const results = (keyed = false) => ['calculus', '資料', '😀'].map(query => db.prepare(`SELECT ${keyed ? '(SELECT id FROM conversations WHERE rowid=conversationRowid)' : 'conversationId'} AS conversationId,messageId,role,title,text,${query === 'calculus' ? 'bm25(chat_fts,0,0,0,8,1)' : '0'} AS rank FROM chat_fts WHERE ${query === 'calculus' ? 'chat_fts MATCH ?' : 'text LIKE ? OR title LIKE ?'} ORDER BY conversationId,messageId`).all(...(query === 'calculus' ? ['"calculus"'] : [`%${query}%`, `%${query}%`])));
    const before = results();
    db.exec(migrations.find(m => m.version === 25)!.sql);
    expect(results(true)).toEqual(before);
    expect(db.prepare('SELECT rowid FROM chat_fts WHERE messageId=?').get(mid)?.rowid).toBe(db.prepare('SELECT rowid FROM messages WHERE id=?').get(mid)?.rowid);
    expect(db.prepare('SELECT count(*) AS n FROM chat_fts').get()?.n).toBe(2);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally { db.close(); }
});

it('pages empty history using the recent index without touching FTS, including empty conversations', () => {
  const s = setup();
  const { c } = conversation(s, 'old');
  const empty = conversationSchema.parse({ id: randomUUID(), scope: 'general', providerId: 'anthropic-api', modelId: 'fake', createdAt: '2026-11-02T00:00:00Z' });
  s.conversations.insert(empty);
  s.db.exec('DROP TABLE chat_fts');
  const first = search(s, { limit: 1 });
  expect(first.items.map(h => h.id)).toEqual([empty.id]);
  expect(first.items[0]?.matches).toEqual([]);
  expect(search(s, { limit: 1, cursor: first.nextCursor }).items.map(h => h.id)).toEqual([c.id]);
  const plan = s.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM conversations WHERE deletedAt IS NULL AND (updatedAt,id)<(?,?) ORDER BY updatedAt DESC,id DESC LIMIT 30").all(empty.createdAt, empty.id);
  expect(JSON.stringify(plan)).toContain('conversations_history_recent');
  expect(JSON.stringify(plan)).not.toContain('TEMP B-TREE');
});

it('keeps keyed FTS rows correct on message moves, reactivation, individual deletes and document cascades', () => {
  const s = setup(), a = conversation(s, 'movable'), b = conversation(s, 'destination');
  s.db.prepare('UPDATE messages SET conversationId=? WHERE id=?').run(b.c.id, a.m.id);
  expect(search(s, { query: 'movable' }).items.map(h => h.id)).toEqual([b.c.id]);
  s.db.prepare('UPDATE messages SET supersededBy=? WHERE id=?').run(b.m.id, a.m.id);
  expect(search(s, { query: 'movable' }).items).toEqual([]);
  s.db.prepare("UPDATE messages SET supersededBy=NULL,role='assistant' WHERE id=?").run(a.m.id);
  expect(search(s, { query: 'movable', role: 'assistant' }).items[0]?.matches[0]?.messageId).toBe(a.m.id);
  s.db.prepare('DELETE FROM messages WHERE id=?').run(a.m.id);
  expect(search(s, { query: 'movable' }).items).toEqual([]);
  const doc = randomUUID();
  s.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Doc','a','hash','/tmp/a','text/plain','ready','/tmp/a','2026-11-01')").run(doc);
  s.db.prepare("UPDATE conversations SET scope='document',documentId=? WHERE id IN (?,?)").run(doc, a.c.id, b.c.id);
  s.db.prepare('DELETE FROM documents WHERE id=?').run(doc);
  expect(s.db.prepare('SELECT * FROM chat_fts').all()).toEqual([]);
});


it('backs up v24 and records a verified v25 checksum before reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-v25-')), path = join(dir, 'db.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL,checksum TEXT)');
    for (const migration of migrations.filter(m => m.version <= 24)) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations VALUES(?,?,?)').run(migration.version, '2026-11-01', migrationChecksum(migration.sql));
    }
    db.close();
    const s = openStore(path);
    try {
      expect(existsSync(path + '.before-v25.bak')).toBe(true);
      if (process.platform !== 'win32') expect(statSync(path + '.before-v25.bak').mode & 0o777).toBe(0o600);
      expect(s.db.prepare('SELECT checksum FROM migrations WHERE version=25').get()?.checksum).toBe(migrationChecksum(migrations.find(m => m.version === 25)!.sql));
    } finally { s.close(); }
    const reopened = openStore(path);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
