import { expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseStream } from './providers/parsers';
import { extractUsage, headerRateLimit } from './providers/usage';
import { estimateCost } from './pricing';
import { openStore } from './db';
import { defaultSettings, usageRecordSchema, chatEventSchema } from '../shared/domain';
import { ipcContract } from '../shared/ipc';
import { budgetState } from '../renderer/usage/budget';
async function events(kind: 'claude' | 'codex') {
  const text = readFileSync(join(import.meta.dirname,'providers/fixtures',`${kind}-live.jsonl`),'utf8');
  async function* chunks() { for(let i=0;i<text.length;i+=7) yield text.slice(i,i+7); }
  const result = []; for await (const e of parseStream(chunks(),kind)) result.push(e); return result;
}
it('parses real Claude 2.1.316 final result once with reported cost and cache totals',async () => {
  const result = await events('claude');
  expect(result.filter(e=>e.type==='usage')).toEqual([{type:'usage',usage:{inputTokens:3230,outputTokens:21,cacheReadTokens:649,cacheWriteTokens:1399,reasoningTokens:0,costUsd:0.0058314000000000005,costSource:'reported'}}]);
  expect(result.at(-1)).toEqual({type:'done'});
});
it('parses real Codex 0.166.0 turn.completed usage',async () => {
  expect((await events('codex')).filter(e=>e.type==='usage')).toEqual([{type:'usage',usage:{inputTokens:23458,outputTokens:5,cacheReadTokens:12288,cacheWriteTokens:0,reasoningTokens:0,costSource:'unknown'}}]);
});
it('supports token_count primary and secondary rate limits without double counting cumulative totals', () => {
  const fixture = JSON.stringify({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:1200,output_tokens:340}},rate_limits:{primary:{used_percent:62,window_minutes:300,resets_at:1793715000},secondary:{used_percent:18,window_minutes:10080,resets_at:1794027600}}}});
  expect(extractUsage(fixture,'codex')).toMatchObject({inputTokens:1200,outputTokens:340,costSource:'unknown',rateLimit:{label:'300 minute window',usedPercent:62,resetsAt:'2026-11-03T14:10:00.000Z'}});
});
it('prices cache and reasoning without double counting, unknown is undefined, and overrides apply', () => {
  const u = {inputTokens:1000000,outputTokens:200000,cacheReadTokens:200000,cacheWriteTokens:100000,reasoningTokens:50000,costSource:'unknown' as const};
  expect(estimateCost('claude-sonnet-5-5',u)).toBe(3.67);
  expect(estimateCost('unknown',u)).toBeUndefined();
  expect(estimateCost('unknown',u, {unknown:{input:1,output:2,cacheRead:.1,cacheWrite:1.25}})).toBe(1.245);
  expect(estimateCost('gpt-6.1-sol',{...u,inputTokens:1000,outputTokens:100,cacheReadTokens:0,cacheWriteTokens:0})).toBe(.003);
});
it('normalizes rate limit headers and validates usage/IPC payloads', () => {
  expect(headerRateLimit(new Headers({'anthropic-ratelimit-tokens-remaining':'50','anthropic-ratelimit-requests-remaining':'3','anthropic-ratelimit-tokens-reset':'2026-11-03T14:20:00Z'}),true)).toEqual({label:'Provider rate limit',remainingTokens:50,remainingRequests:3,resetsAt:'2026-11-03T14:20:00.000Z'});
  expect(chatEventSchema.safeParse({type:'usage',usage:{inputTokens:-1,outputTokens:1,costSource:'reported'}}).success).toBe(false);
  expect(ipcContract['usage:summary'].request.safeParse({period:'year'}).success).toBe(false);
  expect(ipcContract['usage:forDocument'].request.safeParse({documentId:'bad'}).success).toBe(false);
  expect(ipcContract['usage:export'].request.safeParse({path:'/tmp/arbitrary'}).success).toBe(false);
});
it('migrates an existing database, aggregates periods and retains spend independently of document deletion', () => {
  const dir=mkdtempSync(join(tmpdir(),'usage-db-')); const path=join(dir,'db');
  let store=openStore(path); store.settings.set({...defaultSettings,monthlyBudgetUsd:10}); store.close();
  const raw=new DatabaseSync(path);raw.exec('DROP TABLE usage_events; DELETE FROM migrations WHERE version=3');raw.close();
  store=openStore(path);
  try {
    expect(store.settings.get().monthlyBudgetUsd).toBe(10);
    const r=usageRecordSchema.parse({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-11-03T00:00:00.000Z',providerId:'codex-cli',modelId:'gpt-6.1-sol',kind:'chat',inputTokens:1200,outputTokens:340,costUsd:.012,costSource:'estimated',conversationId:'00000000-0000-4000-8000-000000000002',documentId:'00000000-0000-4000-8000-000000000003'});
    store.usage.record(r);store.usage.record({...r,id:'00000000-0000-4000-8000-000000000004',createdAt:'2026-10-01T00:00:00.000Z',costUsd:undefined,costSource:'unknown'});
    const summary=store.usage.summary('month',new Date('2026-11-03T16:00:00Z'));
    expect(summary).toEqual({inputTokens:1200,outputTokens:340,costUsd:.012,unknownPrices:0,calls:1,groups:[{providerId:'codex-cli',modelId:'gpt-6.1-sol',documentId:r.documentId,inputTokens:1200,outputTokens:340,costUsd:.012,unknownPrices:0,calls:1}]});
    expect(store.usage.forConversation(r.conversationId!).length).toBe(2);expect(store.usage.forDocument(r.documentId!).length).toBe(2);
    store.documents.delete(r.documentId!);expect(store.usage.list()).toHaveLength(2);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
it('warns at literal budget boundaries and predicts exceeding either cap', () => {
  const summary={inputTokens:1200,outputTokens:340,costUsd:8,unknownPrices:0};
  expect(budgetState({...defaultSettings,monthlyBudgetUsd:10},summary,{tokens:10,costUsd:3})).toMatchObject({percent:80,tone:'amber',exceeds:true});
  expect(budgetState({...defaultSettings,monthlyTokenBudget:1540},summary)).toMatchObject({percent:100,tone:'red'});
  expect(budgetState(defaultSettings,summary,{tokens:10000,costUsd:100})).toMatchObject({percent:0,exceeds:false});
});
it('merges Anthropic start/delta counters and emits one usage before the terminal frame',async()=>{
  async function* chunks(){yield 'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":20,"cache_creation_input_tokens":10,"output_tokens":1}}}\n\n';yield 'data: {"type":"message_delta","usage":{"output_tokens":40}}\n\ndata: {"type":"message_stop"}\n\n';}
  const snapshots: unknown[]=[];const result=[];for await(const event of parseStream(chunks(),'anthropic',true,u=>snapshots.push(u)))result.push(event);
  expect(result).toEqual([{type:'usage',usage:{inputTokens:130,outputTokens:40,cacheReadTokens:20,cacheWriteTokens:10,costSource:'unknown'}},{type:'done'}]);
  expect(snapshots.at(-1)).toMatchObject({inputTokens:130,outputTokens:40});
});
it('reads OpenAI usage-only chunks, cache details and reasoning details',async()=>{
  async function* chunks(){yield 'data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":340,"prompt_tokens_details":{"cached_tokens":200},"completion_tokens_details":{"reasoning_tokens":40}}}\n\ndata: [DONE]\n\n';}
  const result=[];for await(const event of parseStream(chunks(),'openai',true))result.push(event);
  expect(result).toEqual([{type:'usage',usage:{inputTokens:1200,outputTokens:340,cacheReadTokens:200,reasoningTokens:40,costSource:'unknown'}},{type:'done'}]);
});
it('dashboard aggregates all-time usage and zero-fills calendar days without counting cache or reasoning twice',()=>{
  const store=openStore(':memory:');
  try {
    const base=usageRecordSchema.parse({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-11-03T00:00:00.000Z',providerId:'codex-cli',modelId:'gpt-6.1-sol',kind:'chat',inputTokens:1200,outputTokens:340,cacheReadTokens:200,cacheWriteTokens:100,reasoningTokens:40,costUsd:.012,costSource:'reported'});
    store.usage.record(base);store.usage.record({...base,id:'00000000-0000-4000-8000-000000000002',createdAt:'2026-10-01T00:00:00.000Z',inputTokens:800,outputTokens:60,costUsd:undefined,costSource:'unknown'});
    store.usage.record({...base,id:'00000000-0000-4000-8000-000000000003',createdAt:'2026-12-01T00:00:00.000Z'});
    const all=store.usage.dashboard('all',new Date('2026-11-03T12:00:00Z'));
    expect(all.summary).toMatchObject({inputTokens:2000,outputTokens:400,calls:2,costUsd:.012,unknownPrices:1});
    expect(all.cacheReadTokens).toBe(400);expect(all.cacheWriteTokens).toBe(200);expect(all.reasoningTokens).toBe(80);
    expect(all.days).toHaveLength(30);expect(all.days.at(-1)).toEqual({date:'2026-11-03',inputTokens:1200,outputTokens:340});
    expect(all.days.filter(d=>d.inputTokens===0)).toHaveLength(29);
    expect(store.usage.dashboard('month',new Date('2026-11-03T12:00:00Z')).summary.calls).toBe(1);
    expect(store.usage.dashboard('day',new Date('2026-11-03T12:00:00Z')).days).toHaveLength(1);
  }finally{store.close();}
});

it('prices verified Luna, Astra and Terra list rates and Claude aliases literally', () => {
  const usage = {inputTokens:100000,outputTokens:10000,costSource:'estimated' as const};
  expect(estimateCost('gpt-6-luna', usage)).toBe(.015);
  expect(estimateCost('gpt-6-astra', usage)).toBe(1.5);
  expect(estimateCost('gpt-6.1-terra', usage)).toBe(.15);
  expect(estimateCost('haiku', usage)).toBe(.015);
  expect(estimateCost('agy-unverified', usage)).toBeUndefined();
});

it('parses Claude stream-json rate_limit_event utilization and reset',()=>{
  expect(extractUsage('{"type":"rate_limit_event","rate_limit_info":{"rateLimitType":"five_hour","utilization":0.62,"resetsAt":1793715000}}','claude')).toEqual({inputTokens:0,outputTokens:0,costSource:'unknown',rateLimit:{label:'five_hour',usedPercent:62,resetsAt:'2026-11-03T14:10:00.000Z'}});
});
