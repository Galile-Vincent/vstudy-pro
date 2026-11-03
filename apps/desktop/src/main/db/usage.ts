import type { DatabaseSync } from 'node:sqlite';
import { usageRecordSchema, type UsagePeriod, type UsageRecord, type UsageSummary } from '../../shared/domain';
export function summarize(records: UsageRecord[]): UsageSummary {
  const total = (rows: UsageRecord[]) => ({
    inputTokens: rows.reduce((n,r) => n + r.inputTokens, 0), outputTokens: rows.reduce((n,r) => n + r.outputTokens, 0),
    costUsd: rows.some(r => r.costUsd !== undefined) ? rows.reduce((n,r) => n + (r.costUsd ?? 0), 0) : undefined,
    unknownPrices: rows.filter(r => r.costUsd === undefined).length, calls: rows.length,
  });
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) { const key = JSON.stringify([r.providerId,r.modelId,r.documentId]); groups.set(key, [...(groups.get(key) ?? []),r]); }
  return { ...total(records), groups: [...groups.values()].map(rows => ({ providerId: rows[0]!.providerId, modelId: rows[0]!.modelId, documentId: rows[0]!.documentId, ...total(rows) })) };
}
export function usageRepository(db: DatabaseSync) {
  const list = (where = '', args: string[] = []): UsageRecord[] => db.prepare(`SELECT payload FROM usage_events ${where} ORDER BY createdAt,id`).all(...args).map(row => usageRecordSchema.parse(JSON.parse(String(row.payload))));
  const periodRecords = (period: UsagePeriod, now: Date) => {
    if (period === 'all') return list('WHERE createdAt<=?', [now.toISOString()]);
    const start = new Date(now);
    if (period === 'last30days') start.setDate(start.getDate() - 29);
    start.setHours(0,0,0,0);
    if (period === 'month') start.setDate(1);
    return list('WHERE createdAt>=? AND createdAt<=?', [start.toISOString(), now.toISOString()]);
  };
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {
    dashboard(period: UsagePeriod, now = new Date()) {
      const records = periodRecords(period, now);
      const start = new Date(now);
      start.setHours(0,0,0,0);
      if (period === 'month') start.setDate(1);
      else if (period !== 'day') start.setDate(start.getDate() - 29);
      const days = new Map<string, {date:string; inputTokens:number; outputTokens:number}>();
      for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate()+1)) { const date=localDate(cursor); days.set(date,{date,inputTokens:0,outputTokens:0}); }
      for (const r of records) { const day=days.get(localDate(new Date(r.createdAt))); if(day) { day.inputTokens+=r.inputTokens; day.outputTokens+=r.outputTokens; } }
      return { summary:summarize(records), cacheReadTokens:records.reduce((n,r)=>n+(r.cacheReadTokens??0),0), cacheWriteTokens:records.reduce((n,r)=>n+(r.cacheWriteTokens??0),0), reasoningTokens:records.reduce((n,r)=>n+(r.reasoningTokens??0),0), days:[...days.values()] };
    },
    record(input: UsageRecord) {
      const r = usageRecordSchema.parse(input);
      db.prepare('INSERT INTO usage_events(id,createdAt,providerId,modelId,kind,conversationId,documentId,messageId,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,reasoningTokens,costUsd,costSource,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(r.id,r.createdAt,r.providerId,r.modelId,r.kind,r.conversationId ?? null,r.documentId ?? null,r.messageId ?? null,r.inputTokens,r.outputTokens,r.cacheReadTokens ?? 0,r.cacheWriteTokens ?? 0,r.reasoningTokens ?? 0,r.costUsd ?? null,r.costSource,JSON.stringify(r));
      return r;
    },
    list,
    rollupSummary(startDate: string, endDate: string) {
      return db.prepare('SELECT providerId,modelId,sum(inputTokens) inputTokens,sum(outputTokens) outputTokens,sum(costUsd) costUsd,sum(calls) calls FROM usage_daily WHERE date>=? AND date<=? GROUP BY providerId,modelId').all(startDate,endDate);
    },
    page(limit: number, cursor?: { createdAt: string; id: string }) {
      const size = Math.min(100, Math.max(1, Math.floor(limit)));
      const rows = db.prepare(`SELECT id,createdAt,payload FROM usage_events ${cursor ? 'WHERE (createdAt,id)>(?,?)' : ''} ORDER BY createdAt,id LIMIT ?`).all(...(cursor ? [cursor.createdAt,cursor.id] : []), size+1);
      const last = rows[Math.min(size,rows.length)-1];
      return { items: rows.slice(0,size).map(r=>usageRecordSchema.parse(JSON.parse(String(r.payload)))), nextCursor:rows.length>size&&last?{createdAt:String(last.createdAt),id:String(last.id)}:null };
    },
    forConversation: (id: string) => list('WHERE conversationId=?', [id]),
    forDocument: (id: string) => list('WHERE documentId=?', [id]),
    conversationTotals: (id: string) => summarize(list('WHERE conversationId=?', [id])),
    documentTotals: (id: string) => summarize(list('WHERE documentId=?', [id])),
    summary(period: 'day' | 'month' | 'last30days', now = new Date()) {
      const start = new Date(now);
      if (period === 'last30days') start.setDate(start.getDate() - 30);
      else { start.setHours(0,0,0,0); if (period === 'month') start.setDate(1); }
      return summarize(list('WHERE createdAt>=? AND createdAt<=?', [start.toISOString(), now.toISOString()]));
    },
    rateLimits() {
      const latest = new Map<string, {providerId: UsageRecord['providerId']; createdAt: string; rateLimit: NonNullable<UsageRecord['rateLimit']>}>();
      for (const r of list()) if (r.rateLimit) latest.set(r.providerId, { providerId: r.providerId, createdAt: r.createdAt, rateLimit: r.rateLimit });
      return [...latest.values()];
    },
  };
}
export const usageMigration = `CREATE TABLE usage_events (
 id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, providerId TEXT NOT NULL, modelId TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('chat','parse')), conversationId TEXT, documentId TEXT, messageId TEXT,
 inputTokens INTEGER NOT NULL, outputTokens INTEGER NOT NULL, cacheReadTokens INTEGER NOT NULL,
 cacheWriteTokens INTEGER NOT NULL, reasoningTokens INTEGER NOT NULL, costUsd REAL, costSource TEXT NOT NULL CHECK(costSource IN ('reported','estimated','unknown')), payload TEXT NOT NULL CHECK(json_valid(payload)));
 CREATE INDEX usage_created ON usage_events(createdAt);
 CREATE INDEX usage_document ON usage_events(documentId);
 CREATE INDEX usage_conversation ON usage_events(conversationId);`;
