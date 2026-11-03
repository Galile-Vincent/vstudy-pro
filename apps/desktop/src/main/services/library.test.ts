import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, existsSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, migrations, type Store } from '../db';
import { documentSchema } from '../../shared/domain';
import { libraryQuerySchema } from '../../shared/library';
import { LibraryService, containedPath } from './library';
import { computeStreak } from './activity';
import { validateImport } from './import-security';
const stores: Store[] = [], dirs: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function fixture() { const s = openStore(':memory:'); stores.push(s); const root = mkdtempSync(join(tmpdir(), 'library-test-')); dirs.push(root); const lib = new LibraryService(s, root); const doc = documentSchema.parse({ id: randomUUID(), title: '資料通信網路', sourceName: '学習.md', sourceHash: randomUUID().replaceAll('-', '').repeat(2), sourcePath: join(root, 'source.md'), markdownPath: join(root, 'content.md'), mime: 'text/markdown', status: 'ready', createdAt: new Date().toISOString() }); writeFileSync(doc.markdownPath, '資料の通信と学習。網路資料 science learning'); s.documents.insert(doc); lib.search.update(doc.id, '資料の通信と学習。網路資料 science learning'); return { s, lib, doc, root }; }
it('finds literal zh-Hant, ja, en and safely handles FTS syntax', () => { const { lib } = fixture(); for (const q of ['資料', '通信', '学習', '網路', 'science', 'learning'])
    expect(lib.search.search(q).items).toHaveLength(1); for (const q of ['OR', 'a:b', '" OR *'])
    expect(() => lib.search.search(q)).not.toThrow(); expect(lib.search.search('science').items[0]?.snippet).toContain('[mark]science[/mark]'); });
it('compares bigram unicode61 and trigram on actual multilingual text', () => { const { s, lib } = fixture(); s.db.exec("CREATE VIRTUAL TABLE bigrams USING fts5(content,tokenize='unicode61')"); const text = '資料の通信と学習 網路資料 science learning'; const bigrams = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu, run => [...run].slice(0,-1).map((c,i)=>c+[...run][i+1]).join(' ')); s.db.prepare('INSERT INTO bigrams VALUES(?)').run(bigrams); for (const q of ['資料', '通信', '学習', '網路']) {
    expect(s.db.prepare('SELECT rowid FROM bigrams WHERE bigrams MATCH ?').all(q)).toHaveLength(1);
    expect(lib.search.search(q).items).toHaveLength(1);
} expect(lib.search.search('science').items).toHaveLength(1); expect(s.db.prepare('SELECT rowid FROM bigrams WHERE bigrams MATCH ?').all('science')).toHaveLength(1); });
it('prevents cycles/depth violations, preserves documents and paginates duplicate positions', () => { const { lib, doc } = fixture(); const a = lib.createFolder('Root', null), b = lib.createFolder('Child', a.id); expect(() => lib.createFolder('root', null)).toThrow(); expect(() => lib.moveFolder(a.id, b.id)).toThrow(); let parent = b.id; for (let i = 0; i < 6; i++)
    parent = lib.createFolder(`child${i}`, parent).id; expect(() => lib.createFolder('too deep', parent)).toThrow(); lib.move([doc.id], b.id); lib.deleteFolder(b.id, 'parent'); expect(lib.list(libraryQuerySchema.parse({ folderId: a.id })).items[0]?.document.id).toBe(doc.id); lib.softDelete(doc.id); expect(lib.search.search('資料').items).toHaveLength(0); lib.restore(doc.id); expect(lib.search.search('資料').items).toHaveLength(1); });
it('computes study days across DST and midnight grace using explicit timezone and clock', () => { const rows = ['2026-03-07', '2026-03-08', '2026-03-09'].map(date => ({ date, chatCount: 1, readSeconds: 0, importCount: 0 })); expect(computeStreak(rows, 'America/New_York', () => new Date('2026-03-10T23:59:59-04:00')).current).toBe(3); expect(computeStreak(rows, 'America/New_York', () => new Date('2026-03-11T00:00:00-04:00')).current).toBe(0); expect(computeStreak(rows, 'Asia/Taipei', () => new Date('2026-03-10T00:00:00+08:00')).current).toBe(3); expect(computeStreak([{ date: '2026-11-01', chatCount: 0, readSeconds: 59, importCount: 0 }], 'America/New_York', () => new Date('2026-11-01T20:00:00Z')).today).toBe(false); });
it('backs up and migrates realistic v4 data with transactionally maintained rollups', () => { const root = mkdtempSync(join(tmpdir(), 'migration-v4-')); dirs.push(root); const path = join(root, 'db.sqlite'); const old = new DatabaseSync(path); old.exec('CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)'); for (const m of migrations.filter(m => m.version < 5)) {
    old.exec(m.sql);
    old.prepare('INSERT INTO migrations VALUES(?,?)').run(m.version, new Date().toISOString());
} old.prepare('INSERT INTO usage_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), '2026-10-01T12:00:00Z', 'openai-api', 'test', 'chat', null, null, null, 50, 20, 0, 0, 0, 0.1, 'reported', '{}'); const documentId=randomUUID(), conversationId=randomUUID();
old.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt,converter) VALUES(?,?,?,?,?,?,'ready',?,?,?)").run(documentId,'學習筆記','study.md','a'.repeat(64),join(root,'source.md'),'text/markdown',join(root,'content.md'),'2026-10-01T12:00:00.000Z','markitdown');
old.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(conversationId,documentId,'openai-api','test','2026-10-01T12:00:00.000Z','{}');
old.prepare('INSERT INTO messages VALUES(?,?,?,?,?)').run(randomUUID(),conversationId,'user',JSON.stringify([{type:'text',text:'請解釋資料通信與網路學習'}]),'2026-10-01T12:01:00.000Z');
old.close(); const s = openStore(path); expect(s.documents.get(documentSchema.parse({id:documentId,title:'x',sourceName:'x',sourceHash:'a'.repeat(64),sourcePath:'x',mime:'x',status:'ready',markdownPath:'x',createdAt:'2026-10-01T00:00:00Z'}).id)?.title).toBe('學習筆記'); expect(s.db.prepare('SELECT updatedAt FROM conversations WHERE id=?').get(conversationId)?.updatedAt).toBe('2026-10-01T12:00:00.000Z'); stores.push(s); expect(existsSync(`${path}.before-v5.bak`)).toBe(true); expect(statSync(path).mode & 0o777).toBe(0o600); expect(s.db.prepare('SELECT inputTokens,calls FROM usage_daily').get()).toEqual({ inputTokens: 50, calls: 1 }); expect(s.db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' }); });
it('uses indexes for metadata, messages, rollups, pins, tags and status hot queries', () => { const { s } = fixture(); for (const query of ["SELECT id FROM documents WHERE folderId IS NULL AND deletedAt IS NULL ORDER BY position,id LIMIT 50", "SELECT id FROM documents WHERE status='ready' AND deletedAt IS NULL ORDER BY createdAt,id LIMIT 50", "SELECT id FROM documents WHERE deletedAt IS NULL AND pinned=1 ORDER BY pinnedAt DESC,id LIMIT 50", "SELECT * FROM messages WHERE conversationId='x' ORDER BY createdAt,id", "SELECT * FROM conversations WHERE documentId='x' ORDER BY updatedAt DESC,id", "SELECT sum(inputTokens) FROM usage_daily WHERE date>='2026-01-01'", "SELECT documentId FROM document_tags WHERE tagId='x'"]) {
    const plan = s.db.prepare('EXPLAIN QUERY PLAN ' + query).all().map(r => String(r.detail)).join('\n');
    expect(plan).toMatch(/(?:USING .*INDEX|USING PRIMARY KEY)/);
    expect(plan).not.toMatch(/SCAN (?:documents|messages|conversations|usage_daily|document_tags)(?!.*INDEX)/);
} });
it('rejects executable signatures, mismatched PDFs and symlink escapes', () => { const { root } = fixture(); const bad = join(root, 'bad.pdf'); writeFileSync(bad, 'MZ fake exe'); expect(() => validateImport(bad, 'pdf')).toThrow(); writeFileSync(bad, 'not a PDF'); expect(() => validateImport(bad, 'pdf')).toThrow(); const link = join(root, 'link'); symlinkSync('/etc/passwd', link); expect(() => containedPath(root, link)).toThrow(); expect(() => validateImport(link, 'txt')).toThrow(); });
it('enforces the undo deadline and purges file directories and search rows', () => { const { lib, s, doc, root } = fixture(); const dir = join(root, doc.sourceHash); requireMkdir(dir); writeFileSync(join(dir, 'source.md'), 'study'); lib.softDelete(doc.id); s.db.prepare('UPDATE documents SET deletedAt=? WHERE id=?').run(new Date(Date.now() - 31000).toISOString(), doc.id); expect(() => lib.restore(doc.id)).toThrow('expired'); lib.purge(); expect(existsSync(dir)).toBe(false); expect(s.db.prepare('SELECT id FROM documents WHERE id=?').get(doc.id)).toBeUndefined(); expect(lib.search.search('資料').items).toHaveLength(0); });
import { mkdirSync as requireMkdir } from 'node:fs';
it('rejects ZIP bombs, excessive entries and Office type mismatches before conversion', () => { const { root } = fixture(); const zip = (size: number, compressed: number, name = 'word/document.xml', entries = 1) => { const entry = Buffer.alloc(46 + Buffer.byteLength(name)); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt32LE(compressed, 20); entry.writeUInt32LE(size, 24); entry.writeUInt16LE(Buffer.byteLength(name), 28); entry.write(name, 46); const head = Buffer.alloc(4); head.writeUInt32LE(0x04034b50); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries, 10); end.writeUInt32LE(4, 16); return Buffer.concat([head, entry, end]); }; const path = join(root, 'bomb.docx'); for (const data of [zip(100000, 1), zip(300000000, 1000000), zip(1, 1, 'word/document.xml', 10001), zip(1, 1, '../escape'), zip(1, 1, 'xl/workbook.xml')]) {
    writeFileSync(path, data);
    expect(() => validateImport(path, 'docx')).toThrow();
} });
it('paginates repeated sort values without duplicates and tracks rollups atomically', () => { const { s, lib, doc } = fixture(); for (let i = 0; i < 5; i++)
    s.documents.insert({ ...doc, id: documentSchema.parse({ ...doc, id: randomUUID() }).id, sourceHash: randomUUID().replaceAll('-', '').repeat(2) }); const ids: string[] = []; let cursor: unknown = undefined; do {
    const page = lib.list(libraryQuerySchema.parse({ sort: 'name', limit: 2, ...(cursor ? { cursor } : {}) }));
    ids.push(...page.items.map(i => i.document.id));
    cursor = page.nextCursor;
} while (cursor); expect(new Set(ids).size).toBe(6); const usage = { id: randomUUID(), createdAt: new Date().toISOString(), providerId: 'openai-api' as const, modelId: 'test', kind: 'chat' as const, inputTokens: 100, outputTokens: 50, costSource: 'unknown' as const }; s.usage.record(usage); expect(() => s.usage.record(usage)).toThrow(); expect(s.db.prepare('SELECT sum(calls) calls,sum(inputTokens) tokens FROM usage_daily').get()).toEqual({ calls: 1, tokens: 100 }); });
import { activeConversions } from './conversion-state';
it('defers physical purge until every converter writer settles',()=>{const {lib,s,doc}=fixture();lib.softDelete(doc.id);s.db.prepare('UPDATE documents SET deletedAt=? WHERE id=?').run(new Date(Date.now()-31_000).toISOString(),doc.id);activeConversions.add(doc.id);try{lib.purge();expect(s.db.prepare('SELECT id FROM documents WHERE id=?').get(doc.id)).toBeDefined();}finally{activeConversions.delete(doc.id);}lib.purge();expect(s.db.prepare('SELECT id FROM documents WHERE id=?').get(doc.id)).toBeUndefined();});
it('orders Pinned by pinnedAt and Recent by lastOpenedAt with stable cursors',()=>{const {s,lib,doc}=fixture();const second=s.documents.insert({...doc,id:documentSchema.parse({...doc,id:randomUUID()}).id,sourceHash:'c'.repeat(64)});for(const [id,date] of [[doc.id,'2026-01-01T00:00:00Z'],[second.id,'2026-02-01T00:00:00Z']])s.db.prepare('UPDATE documents SET pinned=1,pinnedAt=?,lastOpenedAt=? WHERE id=?').run(date!,date!,id!);for(const view of ['pinned','recent']){const first=lib.list(libraryQuerySchema.parse({view,limit:1}));expect(first.items[0]?.document.id).toBe(second.id);const next=lib.list(libraryQuerySchema.parse({view,limit:1,cursor:first.nextCursor}));expect(next.items[0]?.document.id).toBe(doc.id);}});

it('hydrates a metadata page and its tags in two queries regardless of page size',()=>{const {s,lib,doc}=fixture();for(let i=0;i<99;i++)s.documents.insert({...doc,id:documentSchema.parse({...doc,id:randomUUID()}).id,sourceHash:randomUUID().replaceAll('-','').repeat(2)});const spy=vi.spyOn(s.db,'prepare');try{const page=lib.list(libraryQuerySchema.parse({limit:100}));expect(page.items).toHaveLength(100);expect(spy).toHaveBeenCalledTimes(2);}finally{spy.mockRestore();}});

it('returns highlighted snippets on every filtered keyset page',()=>{const {s,lib,doc}=fixture();for(let i=0;i<3;i++){const next={...doc,id:documentSchema.parse({...doc,id:randomUUID()}).id,sourceHash:randomUUID().replaceAll('-','').repeat(2)};s.documents.insert(next);lib.search.update(next.id,'資料 通信 science learning');}let cursor:unknown;let count=0;do{const page=lib.list(libraryQuerySchema.parse({text:'science',limit:1,...(cursor?{cursor}:{})}));expect(page.items[0]?.snippet).toContain('[mark]science[/mark]');count+=page.items.length;cursor=page.nextCursor;}while(cursor);expect(count).toBe(4);});

it('counts descendant documents and excludes deleted documents throughout the tree', () => {
 const {lib,doc}=fixture(); const parent=lib.createFolder('Parent',null),child=lib.createFolder('Child',parent.id),leaf=lib.createFolder('Leaf',child.id);
 lib.move([doc.id],leaf.id);
 for(const id of [parent.id,child.id,leaf.id]) expect(lib.folders().find(f=>f.id===id)?.count).toBe(1);
 lib.softDelete(doc.id); expect(lib.folders().find(f=>f.id===parent.id)?.count).toBe(0);
 lib.restore(doc.id); lib.move([doc.id],null); expect(lib.folders().find(f=>f.id===parent.id)?.count).toBe(0);
});

it.each(['asc','desc'])('paginates unknown and known sizes without dropping rows (%s)',direction=>{
 const {s,lib,doc}=fixture();
 for(let i=0;i<3;i++) {const d=s.documents.insert({...doc,id:randomUUID() as never,sourceHash:randomUUID().replaceAll('-','').repeat(2)});if(i===2)s.db.prepare('UPDATE documents SET sizeBytes=10 WHERE id=?').run(d.id);}
 const ids:string[]=[];let cursor:unknown;
 do {const page=lib.list(libraryQuerySchema.parse({sort:'size',direction,limit:1,...(cursor?{cursor}:{})}));ids.push(...page.items.map(i=>i.document.id));cursor=page.nextCursor;}while(cursor);
 expect(ids).toHaveLength(4);expect(new Set(ids).size).toBe(4);
});
