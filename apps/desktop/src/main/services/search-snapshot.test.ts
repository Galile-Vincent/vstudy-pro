import { expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { SearchService } from './search';

const require = createRequire(import.meta.url);
const schema = "PRAGMA journal_mode=WAL; CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,sourceName TEXT,deletedAt TEXT,status TEXT,markdownPath TEXT,activeVersion TEXT,contentChars INTEGER); CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')";
const delay = () => new Promise(resolve => setTimeout(resolve, 5));

it('checks once per seven days, forces desync and retries a failed check', async () => {
  const root = mkdtempSync(join(tmpdir(), 'search-throttle-'));
  const db = new DatabaseSync(join(root, 'test.sqlite'));
  const clock = vi.spyOn(Date, 'now');
  try {
    db.exec(schema);
    const search = new SearchService(db, root);
    const content = join(root, 'content.md');
    writeFileSync(content, 'science learning');
    db.prepare("INSERT INTO documents VALUES('one','Notes','notes.md',NULL,'ready',?,'original',0)").run(content);
    search.update('one', 'science learning');
    const marker = join(root, 'fts-check.json');
    const start = Date.UTC(2026, 0, 1);
    clock.mockReturnValue(start);
    await search.rebuild();
    expect(JSON.parse(readFileSync(marker, 'utf8')).lastSuccess).toBe(start);
    (db as DatabaseSync & {enableDefensive(enabled: boolean): void}).enableDefensive(false);
    db.exec("UPDATE document_fts_data SET block=x'00' WHERE id>10");
    clock.mockReturnValue(start + 86400000);
    await search.rebuild();
    expect(JSON.parse(readFileSync(marker, 'utf8')).lastSuccess).toBe(start);
    expect(() => db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')")).toThrow();
    clock.mockReturnValue(start + 8 * 86400000);
    await search.rebuild();
    expect(JSON.parse(readFileSync(marker, 'utf8')).lastSuccess).toBe(Date.now());
    expect(() => db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')")).not.toThrow();
    clock.mockReturnValue(start + 9 * 86400000);
    db.exec("INSERT INTO document_fts VALUES('orphan','old','old','obsolete')");
    await search.rebuild();
    expect(JSON.parse(readFileSync(marker, 'utf8')).lastSuccess).toBe(Date.now());
    const controller = new AbortController();
    controller.abort();
    await expect(search.rebuild({signal:controller.signal})).rejects.toThrow();
    expect(JSON.parse(readFileSync(marker, 'utf8')).pending).toBe(true);
    clock.mockReturnValue(start + 10 * 86400000);
    await search.rebuild();
    expect(JSON.parse(readFileSync(marker, 'utf8')).lastSuccess).toBe(Date.now());
    expect(readdirSync(join(root, 'tmp/fts-check'))).toEqual([]);
  } finally { clock.mockRestore(); db.close(); rmSync(root, {recursive:true,force:true}); }
});

it('scavenges old snapshots even from a live process before a throttled run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'search-scavenge-'));
  const db = new DatabaseSync(join(root, 'test.sqlite'));
  try {
    db.exec(schema);
    const search = new SearchService(db, root);
    await search.rebuild();
    const directory = join(root, 'tmp/fts-check', `vstudy-search-check-${process.pid}-stale`);
    mkdirSync(directory, {recursive:true});
    writeFileSync(join(directory, 'snapshot.sqlite'), 'leftover');
    const old = new Date(Date.now() - 360000);
    utimesSync(directory, old, old);
    await search.rebuild();
    expect(readdirSync(join(root, 'tmp/fts-check'))).toEqual([]);
  } finally { db.close(); rmSync(root, {recursive:true,force:true}); }
});

it.each(['SIGKILL', 'SIGTERM', 'worker termination'] as const)('cleans snapshot bytes after %s', async kind => {
  const root = mkdtempSync(join(tmpdir(), 'search-interrupt-'));
  const path = join(root, 'test.sqlite');
  const db = new DatabaseSync(path);
  const originalTmp = new Set(readdirSync(tmpdir()));
  const snapshotRoot = join(root, 'tmp/fts-check');
  const directories = () => [
    ...readdirSync(tmpdir()).filter(name => name.startsWith('vstudy-search-check-') && !originalTmp.has(name)).map(name => join(tmpdir(), name)),
    ...( (() => { try { return readdirSync(snapshotRoot).map(name => join(snapshotRoot, name)); } catch { return []; } })() ),
  ];
  const bytes = () => directories().reduce((total, dir) => { try { return total + statSync(join(dir, 'snapshot.sqlite')).size; } catch { return total; } }, 0);
  let child: ReturnType<typeof spawn> | undefined;
  try {
    db.exec(schema);
    const content = Array.from({length:10000}, (_, i) => `word${i}`).join(' ').slice(0,60000);
    db.exec('BEGIN');
    for (let i = 0; i < 2000; i++) {
      db.prepare("INSERT INTO documents VALUES(?,'Notes','notes.md',NULL,'ready','','original',60000)").run(String(i));
      db.prepare("INSERT INTO document_fts VALUES(?,'Notes','notes.md',?)").run(String(i), content);
    }
    db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
    const module = join(root, 'search.cjs');
    const { build } = require(require.resolve('esbuild', {paths:[require.resolve('vite')]}));
    await build({entryPoints:[join(import.meta.dirname,'search.ts')],bundle:true,platform:'node',format:'cjs',outfile:module});
    const script = `const wt=require('node:worker_threads');let active;const Original=wt.Worker;wt.Worker=class extends Original{constructor(...args){super(...args);active=this;}};const {DatabaseSync}=require('node:sqlite');const {SearchService}=require(${JSON.stringify(module)});process.on('message',()=>active.terminate());new SearchService(new DatabaseSync(${JSON.stringify(path)}),${JSON.stringify(root)}).rebuild().then(()=>process.exit(0),()=>process.send('stopped'));`;
    child = spawn(process.execPath, ['-e', script], {stdio:['ignore','ignore','ignore','ipc']});
    const exited = once(child, 'exit');
    const deadline = Date.now() + 15000;
    while (bytes() < 1000000 && Date.now() < deadline) await delay();
    expect(bytes()).toBeGreaterThan(1000000);
    expect(directories().every(directory => directory.startsWith(snapshotRoot))).toBe(true);
    if (kind !== 'worker termination') {
      child.kill(kind);
      await exited;
    } else {
      const stopped = once(child, 'message');
      child.send('terminate');
      await stopped;
    }
    const before = bytes();
    // Windows kill('SIGTERM') also hard-terminates: no JS cleanup handler can run.
    // Both hard-kill paths must be scavenged by the next maintenance run.
    if (kind === 'SIGKILL' || (kind === 'SIGTERM' && process.platform === 'win32'))
      await new SearchService(db, root).rebuild();
    const after = bytes();
    process.stdout.write(`SNAPSHOT ${kind} interruptedBytes=${before} afterCleanupBytes=${after}\n`);
    expect(after).toBe(0);
    expect(readdirSync(snapshotRoot)).toEqual([]);
  } finally {
    child?.kill('SIGKILL');
    db.close();
    const removal = {recursive:true,force:true,maxRetries:8,retryDelay:100};
    for (const directory of directories()) rmSync(directory, removal);
    rmSync(root, removal);
  }
}, 120000);
