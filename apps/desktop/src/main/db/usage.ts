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
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const range = (period: UsagePeriod, now: Date) => {
    const start = new Date(now);
    if (period === 'month') start.setDate(1);
    else if (period === 'last30days') start.setDate(start.getDate() - 29);
    return [period === 'all' ? '0000-01-01' : localDate(start), localDate(now)];
  };
  const totals = (period: UsagePeriod, now: Date): UsageSummary => {
    const groups = db.prepare(`SELECT providerId,modelId,documentId,sum(inputTokens) inputTokens,sum(outputTokens) outputTokens,
      sum(costUsd) costUsd,sum(unknownPrices) unknownPrices,sum(calls) calls FROM usage_daily
      WHERE date>=? AND date<=? GROUP BY providerId,modelId,documentId`).all(...range(period, now)).map(row => ({
        providerId: row.providerId as UsageRecord['providerId'], modelId: String(row.modelId),
        documentId: row.documentId ? String(row.documentId) as UsageRecord['documentId'] : undefined,
        inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens), calls: Number(row.calls),
        unknownPrices: Number(row.unknownPrices), costUsd: Number(row.calls) === Number(row.unknownPrices) ? undefined : Number(row.costUsd),
      }));
    return { groups, inputTokens: groups.reduce((n,r)=>n+r.inputTokens,0), outputTokens: groups.reduce((n,r)=>n+r.outputTokens,0),
      calls: groups.reduce((n,r)=>n+r.calls,0), unknownPrices: groups.reduce((n,r)=>n+r.unknownPrices,0),
      costUsd: groups.some(r=>r.costUsd!==undefined) ? groups.reduce((n,r)=>n+(r.costUsd??0),0) : undefined };
  };
  return {
    dashboard(period: UsagePeriod, now = new Date()) {
      const start = new Date(now);
      if (period === 'month') start.setDate(1);
      else if (period !== 'day') start.setDate(start.getDate()-29);
      start.setHours(0,0,0,0);
      const days = new Map<string, {date:string; inputTokens:number; outputTokens:number}>();
      for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate()+1)) {
        const date=localDate(cursor); days.set(date,{date,inputTokens:0,outputTokens:0});
      }
      const rows = db.prepare(`SELECT date,sum(inputTokens) inputTokens,sum(outputTokens) outputTokens,
        sum(cacheReadTokens) cacheReadTokens,sum(cacheWriteTokens) cacheWriteTokens,sum(reasoningTokens) reasoningTokens
        FROM usage_daily WHERE date>=? AND date<=? GROUP BY date`).all(...range(period,now));
      for (const row of rows) if (days.has(String(row.date))) days.set(String(row.date), {date:String(row.date),inputTokens:Number(row.inputTokens),outputTokens:Number(row.outputTokens)});
      return { summary:totals(period,now), cacheReadTokens:rows.reduce((n,r)=>n+Number(r.cacheReadTokens),0),
        cacheWriteTokens:rows.reduce((n,r)=>n+Number(r.cacheWriteTokens),0), reasoningTokens:rows.reduce((n,r)=>n+Number(r.reasoningTokens),0), days:[...days.values()] };
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
    summary(period: 'day' | 'month' | 'last30days', now = new Date()) { return totals(period,now); },
    rateLimits() {
      return db.prepare('SELECT providerId,createdAt,rateLimit FROM latest_rate_limits ORDER BY providerId').all().map(row => ({
        providerId: row.providerId as UsageRecord['providerId'], createdAt:String(row.createdAt),
        rateLimit: JSON.parse(String(row.rateLimit)) as NonNullable<UsageRecord['rateLimit']>,
      }));
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

export const usageRollupMigration = `
DROP TRIGGER usage_rollup;
ALTER TABLE usage_daily ADD COLUMN unknownPrices INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN cacheReadTokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN cacheWriteTokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN reasoningTokens INTEGER NOT NULL DEFAULT 0;
DELETE FROM usage_daily;
INSERT INTO usage_daily SELECT date(createdAt,'localtime'),providerId,modelId,ifnull(documentId,''),sum(inputTokens),sum(outputTokens),sum(ifnull(costUsd,0)),count(*),sum(costUsd IS NULL),sum(cacheReadTokens),sum(cacheWriteTokens),sum(reasoningTokens) FROM usage_events GROUP BY 1,2,3,4;
CREATE TRIGGER usage_rollup AFTER INSERT ON usage_events BEGIN
INSERT INTO usage_daily VALUES(date(NEW.createdAt,'localtime'),NEW.providerId,NEW.modelId,ifnull(NEW.documentId,''),NEW.inputTokens,NEW.outputTokens,ifnull(NEW.costUsd,0),1,NEW.costUsd IS NULL,NEW.cacheReadTokens,NEW.cacheWriteTokens,NEW.reasoningTokens)
ON CONFLICT(date,providerId,modelId,documentId) DO UPDATE SET inputTokens=inputTokens+excluded.inputTokens,outputTokens=outputTokens+excluded.outputTokens,costUsd=costUsd+excluded.costUsd,calls=calls+1,unknownPrices=unknownPrices+excluded.unknownPrices,cacheReadTokens=cacheReadTokens+excluded.cacheReadTokens,cacheWriteTokens=cacheWriteTokens+excluded.cacheWriteTokens,reasoningTokens=reasoningTokens+excluded.reasoningTokens;
END;
CREATE TABLE latest_rate_limits(providerId TEXT PRIMARY KEY,createdAt TEXT NOT NULL,id TEXT NOT NULL,rateLimit TEXT NOT NULL CHECK(json_valid(rateLimit)));
INSERT INTO latest_rate_limits SELECT providerId,createdAt,id,rateLimit FROM (
 SELECT providerId,createdAt,id,json_extract(payload,'$.rateLimit') rateLimit,row_number() OVER(PARTITION BY providerId ORDER BY createdAt DESC,id DESC) rank FROM usage_events WHERE json_type(payload,'$.rateLimit')='object'
) WHERE rank=1;
CREATE TRIGGER usage_rate_limit AFTER INSERT ON usage_events WHEN json_type(NEW.payload,'$.rateLimit')='object' BEGIN
 INSERT INTO latest_rate_limits VALUES(NEW.providerId,NEW.createdAt,NEW.id,json_extract(NEW.payload,'$.rateLimit'))
 ON CONFLICT(providerId) DO UPDATE SET createdAt=excluded.createdAt,id=excluded.id,rateLimit=excluded.rateLimit WHERE (excluded.createdAt,excluded.id)>(latest_rate_limits.createdAt,latest_rate_limits.id);
END;
CREATE INDEX documents_ready_created ON documents(createdAt DESC,id) WHERE deletedAt IS NULL AND status='ready';
CREATE INDEX documents_pinned_order ON documents(pinnedAt DESC,id) WHERE deletedAt IS NULL AND pinned=1;
`;
