import type { DatabaseSync } from 'node:sqlite';
import { usageRecordSchema, type UsageRecord, type UsageSummary } from '../../shared/domain';
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
  return {
    record(input: UsageRecord) {
      const r = usageRecordSchema.parse(input);
      db.prepare('INSERT INTO usage_events(id,createdAt,providerId,modelId,kind,conversationId,documentId,messageId,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,reasoningTokens,costUsd,costSource,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(r.id,r.createdAt,r.providerId,r.modelId,r.kind,r.conversationId ?? null,r.documentId ?? null,r.messageId ?? null,r.inputTokens,r.outputTokens,r.cacheReadTokens ?? 0,r.cacheWriteTokens ?? 0,r.reasoningTokens ?? 0,r.costUsd ?? null,r.costSource,JSON.stringify(r));
      return r;
    },
    list,
    forConversation: (id: string) => list('WHERE conversationId=?', [id]),
    forDocument: (id: string) => list('WHERE documentId=?', [id]),
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
