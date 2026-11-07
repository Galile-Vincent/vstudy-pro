// Run from the repo root: node docs/evidence/startup-b/bench.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(resolve('apps/desktop/package.json'));
const { createServer } = await import(require.resolve('vite'));
const baseline = process.argv.includes('--baseline');
const entries = ['services/search.ts', 'db/migrate.ts'].map(file => resolve('apps/desktop/src/main',file));
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, plugins: baseline ? [{
  name: 'baseline-source', enforce: 'pre',
  load(id) { if (entries.includes(id)) return execFileSync('git',['show',`c67522f5:${id.slice(process.cwd().length+1)}`],{encoding:'utf8'}); },
}] : [] });
const { SearchService } = await vite.ssrLoadModule(resolve('apps/desktop/src/main/services/search.ts'));
const { migrate } = await vite.ssrLoadModule(resolve('apps/desktop/src/main/db/migrate.ts'));
const dir = mkdtempSync(join(tmpdir(), 'startup-b-'));
const time = async fn => { const start = performance.now(); await fn(); return (performance.now() - start).toFixed(1); };
let db;
try {
  db = new DatabaseSync(join(dir, 'corpus.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,sourceName TEXT,deletedAt TEXT,status TEXT,markdownPath TEXT,activeVersion TEXT,contentChars INTEGER); CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')`);
  const insert = db.prepare("INSERT INTO documents VALUES(?,?,?,NULL,'ready','/missing','original',15360)");
  const fts = db.prepare('INSERT INTO document_fts VALUES(?,?,?,?)');
  let seed = 42;
  const content = Array.from({length:2560}, () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed.toString(36).padStart(7,'0'); }).join(' ').slice(0,15360);
  let count = 0;
  for (const size of [1000,3000,6000]) {
    db.exec('BEGIN');
    for (; count<size; count++) { const id = String(count); insert.run(id,'Course notes','notes.md'); fts.run(id,'Course notes','notes.md',content); }
    db.exec('COMMIT');
    const check = await time(() => db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')"));
    let ticks = 0, last = performance.now(), maxGap = 0; const heartbeat = setInterval(() => { const now=performance.now(); maxGap=Math.max(maxGap,now-last);last=now;ticks++; }, 5);
    const rebuild = await time(() => new SearchService(db).rebuild());
    clearInterval(heartbeat);
    console.log(`documents=${size} textBytes=15360 ftsCheckMs=${check} rebuildMs=${rebuild} heartbeatTicks=${ticks} maxHeartbeatGapMs=${maxGap.toFixed(1)}`);
  }
  console.log(`largeDbBytes=${statSync(join(dir,'corpus.sqlite')).size} integrityCheckMs=${await time(() => db.prepare('PRAGMA integrity_check').all())} quickCheckMs=${await time(() => db.prepare('PRAGMA quick_check').all())}`);
  db.close(); db = undefined;
  const migrations = [1,2,3,4].map(version => ({version,sql:`CREATE TABLE version${version}(value TEXT)`}));
  const path = join(dir,'upgrade.sqlite'); db = new DatabaseSync(path);
  migrate(db,migrations.slice(0,1));
  db.exec("CREATE TABLE payload(id INTEGER PRIMARY KEY,content TEXT); CREATE INDEX payload_content ON payload(content)");
  const payload=db.prepare('INSERT INTO payload(content) VALUES(?)'); db.exec('BEGIN');
  for(let i=0;i<6000;i++) payload.run(content); db.exec('COMMIT');
  console.log(`relationalDbBytes=${statSync(path).size} integrityCheckMs=${await time(() => db.prepare('PRAGMA integrity_check').all())} quickCheckMs=${await time(() => db.prepare('PRAGMA quick_check').all())}`);
  console.log(`pending=3 migrationMs=${await time(() => migrate(db,migrations,path))} snapshots=${readdirSync(dir).filter(name=>name.endsWith('.bak')).length}`);
} finally { db?.close(); await vite.close(); rmSync(dir,{recursive:true,force:true}); }
