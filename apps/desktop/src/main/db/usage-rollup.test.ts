import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrations, openStore, type Store } from './index';
import { usageRepository, summarize } from './usage';
import { usageRecordSchema } from '../../shared/domain';
import { randomUUID } from 'node:crypto';
const stores: Store[]=[];
afterEach(()=>stores.splice(0).forEach(s=>s.close()));
function record(createdAt='2026-11-03T00:00:00Z') { return usageRecordSchema.parse({id:randomUUID(),createdAt,providerId:'codex-cli',modelId:'test',kind:'chat',inputTokens:10,outputTokens:5,cacheReadTokens:3,cacheWriteTokens:2,reasoningTokens:1,costSource:'unknown',rateLimit:{label:'limit',usedPercent:25}}); }
it('backfills pre-v8 data, preserves unknown costs and extra counters, and orders rate limits by timestamp',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  for(const migration of migrations.filter(m=>m.version<8)) db.exec(migration.sql);
  const usage=usageRepository(db), old=record(); usage.record(old);
  db.exec(migrations.find(m=>m.version===8)!.sql);
  for(const migration of migrations.filter(m=>m.version>8))db.exec(migration.sql);
  const known={...record(),costUsd:0.4,costSource:'reported' as const};usage.record(known);
  usage.record({...record('2026-10-01T00:00:00Z'),rateLimit:{label:'stale',usedPercent:99}});
  expect(usage.summary('month',new Date('2026-11-03T12:00:00Z'))).toEqual(summarize([old,known]));
  expect(usage.dashboard('month',new Date('2026-11-03T12:00:00Z'))).toMatchObject({cacheReadTokens:6,cacheWriteTokens:4,reasoningTokens:2});
  expect(usage.rateLimits()).toHaveLength(1);expect(usage.rateLimits()[0]?.rateLimit.usedPercent).toBe(25);
  expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
 } finally {db.close();}
});
it('every summary/dashboard/rate-limit hot statement avoids usage_events and has an explainable plan',()=>{
 const store=openStore(':memory:');stores.push(store);store.usage.record(record());
 const original=store.db.prepare.bind(store.db), statements:string[]=[];
 const spy=vi.spyOn(store.db,'prepare').mockImplementation(sql=>{statements.push(sql);return original(sql);});
 for(const period of ['day','month','last30days'] as const) store.usage.summary(period);
 for(const period of ['day','month','last30days','all'] as const) store.usage.dashboard(period);
 store.usage.rateLimits();spy.mockRestore();
 expect(statements.length).toBeGreaterThan(5);
 for(const sql of statements) {
  expect(sql).not.toMatch(/usage_events/i);
  const args=Array.from({length:(sql.match(/\?/g)??[]).length},()=> '2026-11-03');
  const plan=original(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map(r=>String(r.detail)).join('\n');
  expect(plan).not.toMatch(/SCAN usage_events/i);
  if(sql.includes('usage_daily')) expect(plan).toMatch(/SEARCH usage_daily USING INDEX/);
 }
});
it('reads disk history and escapes CSV in a worker without touching the main-thread event iterator',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {readUsageHistory,readUsageCsv}=await import('./usage-reader');
 const directory=mkdtempSync(join(tmpdir(),'usage-worker-')),store=openStore(join(directory,'db'));
 try {
  store.usage.record({...record(),modelId:'=untrusted'});
  const spy=vi.spyOn(store.usage,'list').mockImplementation(()=>{throw new Error('main-thread scan');});
  expect(await readUsageHistory(store,'all')).toHaveLength(1);
  expect(await readUsageCsv(store)).toContain('"\'=untrusted"');
  expect(spy).not.toHaveBeenCalled();
 } finally {store.close();rmSync(directory,{recursive:true,force:true});}
});

it('indexes audit foreign-key and normalized recent-order lookups',()=>{
 const store=openStore(':memory:');stores.push(store);
 for(const [sql,index] of [
  ['SELECT id FROM activity_events WHERE documentId=?','activity_document'],
  ['SELECT id FROM documents WHERE folderId=?','documents_folder_fk'],
  ["SELECT id FROM documents WHERE deletedAt IS NULL ORDER BY coalesce(lastOpenedAt,''),id LIMIT ?",'documents_opened_normalized'],
 ]) {
  const plan=store.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1).map(row=>String(row.detail)).join('\n');
  expect(plan).toContain(index);expect(plan).not.toContain('USE TEMP B-TREE');
 }
});
