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
  const INTERVAL=30;
  const percentile=(values:number[],share:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*share))]!;};
  const measure=async(work:()=>Promise<unknown>)=>{
    let last=performance.now(),prevTook=0,maxLate=0,busy=0;
    const latencies:number[]=[];
    const lateness=(now:number)=>now-last-Math.max(INTERVAL,prevTook);
    const timer=setInterval(()=>{
      const now=performance.now();
      maxLate=Math.max(maxLate,lateness(now));last=now;
      const start=performance.now();
      try { db.exec('INSERT OR REPLACE INTO heartbeat VALUES(1,1)'); }
      catch (error) { if (((error as {errcode?:number}).errcode ?? 0) % 256 !== 5) throw error; busy++; }
      prevTook=performance.now()-start;latencies.push(prevTook);
    },INTERVAL);
    try { await work(); }
    finally { clearInterval(timer); }
    // A block at the very end of the work resolves it before the next tick could record the delay, so count it here.
    maxLate=Math.max(maxLate,lateness(performance.now()));
    return {latencies,maxLate,busy,p90:percentile(latencies,0.9),maxWrite:Math.max(...latencies)};
  };
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,sourceName TEXT,deletedAt TEXT,status TEXT,markdownPath TEXT,activeVersion TEXT,contentChars INTEGER); CREATE TABLE heartbeat(id INTEGER PRIMARY KEY,value INTEGER); CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')");
    const content=Array.from({length:10000},(_,i)=>`word${i}`).join(' ').slice(0,60000);
    db.exec('BEGIN');
    for(let i=0;i<2000;i++) {
      db.prepare("INSERT INTO documents VALUES(?,'Notes','notes.md',NULL,'ready','','original',60000)").run(String(i));
      db.prepare("INSERT INTO document_fts VALUES(?,'Notes','notes.md',?)").run(String(i),content);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    // No busy wait: a heartbeat that needs a lock maintenance holds fails at once instead of hiding in a retry.
    db.exec('PRAGMA busy_timeout=0');
    // Diagnostic only, never asserted: the same heartbeat on the same database with no maintenance running, so a slow run shows
    // whether the runner stalls on its own or only while maintenance is active.
    const idle=await measure(()=>new Promise(resolve=>setTimeout(resolve,1500)));
    process.stdout.write(`CONTROL idle writes=${idle.latencies.length} p90Ms=${idle.p90.toFixed(1)} maxWriteMs=${idle.maxWrite.toFixed(1)} maxLoopLateMs=${idle.maxLate.toFixed(1)} busy=${idle.busy}\n`);
    const run=await measure(()=>new SearchService(db,root).rebuild());
    process.stdout.write(`CONTENTION documents=2000 p90Ms=${run.p90.toFixed(1)} maxWriteMs=${run.maxWrite.toFixed(1)} maxLoopLateMs=${run.maxLate.toFixed(1)} busy=${run.busy} writes=${run.latencies.length}\n`);
    expect(run.latencies.length).toBeGreaterThan(0);
    // Sampled every 30ms: a lock held by maintenance makes a heartbeat fail, and work run on the main thread delays the next tick.
    expect(run.busy).toBe(0);
    expect(run.maxLate).toBeLessThan(process.env.CI ? 750 : 150);
    // Sustained blocking shows in the typical write, so p90 stays strict locally and generous on shared runners (62ms and 92ms p90 were observed on Windows).
    // One slow disk write on a hosted runner (116ms, 578ms and 1541ms on Windows, 75ms and 774ms on macOS were observed) only
    // gets a loose bound, far below busy_timeout (5s).
    expect(run.p90).toBeLessThan(process.env.CI ? 250 : 50);
    expect(run.maxWrite).toBeLessThan(process.env.CI ? 3000 : 50);
    expect(db.prepare('SELECT value FROM heartbeat WHERE id=1').get()?.value).toBe(1);
  } finally {db.close();rmSync(root,{recursive:true,force:true});}
},120000);
