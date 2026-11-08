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

it('keeps overlapping main writes responsive while checking 2000 documents', async () => {
  const root=mkdtempSync(join(tmpdir(),'search-contention-')), db=new DatabaseSync(join(root,'test.sqlite'));
  let maxWrite=0,maxGap=0,last=performance.now(),writes=0;
  const latencies:number[]=[];
  let timer:ReturnType<typeof setInterval>|undefined;
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,sourceName TEXT,deletedAt TEXT,status TEXT,markdownPath TEXT,activeVersion TEXT,contentChars INTEGER); CREATE TABLE heartbeat(id INTEGER PRIMARY KEY,value INTEGER); CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')");
    const content=Array.from({length:10000},(_,i)=>`word${i}`).join(' ').slice(0,60000);
    db.exec('BEGIN');
    for(let i=0;i<2000;i++) {
      db.prepare("INSERT INTO documents VALUES(?,'Notes','notes.md',NULL,'ready','','original',60000)").run(String(i));
      db.prepare("INSERT INTO document_fts VALUES(?,'Notes','notes.md',?)").run(String(i),content);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    last=performance.now();
    timer=setInterval(()=>{
      const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;
      const start=performance.now();db.exec('INSERT OR REPLACE INTO heartbeat VALUES(1,1)');const took=performance.now()-start;latencies.push(took);maxWrite=Math.max(maxWrite,took);writes++;
    },30);
    await new SearchService(db,root).rebuild();
    process.stdout.write(`CONTENTION documents=2000 maxWriteMs=${maxWrite.toFixed(1)} maxEventLoopGapMs=${maxGap.toFixed(1)} writes=${writes}\n`);
    expect(writes).toBeGreaterThan(0);
    // Sustained blocking shows in the typical write, so p90 stays strict everywhere.
    // One slow disk write on a hosted runner (116ms and 578ms on Windows, 75ms and 774ms on macOS were observed) only
    // gets a loose bound, far below busy_timeout (5s).
    const sorted=[...latencies].sort((a,b)=>a-b);
    const p90=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*0.9))]!;
    expect(p90).toBeLessThan(50);
    expect(maxWrite).toBeLessThan(process.env.CI ? 1500 : 50);
    expect(db.prepare('SELECT value FROM heartbeat WHERE id=1').get()?.value).toBe(1);
  } finally {clearInterval(timer);db.close();rmSync(root,{recursive:true,force:true});}
},120000);
