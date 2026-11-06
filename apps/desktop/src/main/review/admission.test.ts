import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { chatRequestSchema, type ChatEvent, type UsageRecord } from '../../shared/domain';
import { openStore, type Store } from '../db';
import type { ProviderAdapter, ProviderRequest } from '../providers';
import { createApiAdapter } from '../providers/api';
import { getReviewAdmission, ReviewAdmission, ReviewBudgetError } from './admission';

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function setup() {
  const store = openStore(':memory:'); stores.push(store);
  return { store, admission: getReviewAdmission(store) };
}
function request(modelId = 'gpt-6.1-sol'): ProviderRequest {
  return { ...chatRequestSchema.parse({ scope:'general', requestId:randomUUID(), conversationId:randomUUID(), providerId:'openai-api', modelId, userMessage:'Extract' }), prompt:'Extract the exchange', systemPrompt:'Return JSON' };
}
function adapter(stream: ProviderAdapter['stream']): ProviderAdapter {
  return { detect:async () => ({available:true}), listModels:async () => [], stream };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return {promise, resolve}; }

it('shares review admission across extraction jobs and generation and denies unknown price before dispatch', async () => {
  const { store, admission } = setup();
  expect(getReviewAdmission(store)).toBe(admission);
  store.settings.set({...store.settings.get(), monthlyTokenBudget:100});
  const hold = deferred(); let calls = 0;
  const provider = adapter(async function* () { calls++; await hold.promise; yield {type:'done'}; });
  const first = admission.execute({purpose:'extraction',request:request(),adapter:provider,outputTokens:50},new AbortController().signal);
  await expect(admission.execute({purpose:'extraction',request:request(),adapter:provider,outputTokens:50},new AbortController().signal)).rejects.toBeInstanceOf(ReviewBudgetError);
  await expect(admission.execute({purpose:'generation',request:request(),adapter:provider,outputTokens:50},new AbortController().signal)).rejects.toBeInstanceOf(ReviewBudgetError);
  await expect(admission.execute({purpose:'generation',request:request('unknown-model'),adapter:provider},new AbortController().signal)).rejects.toMatchObject({errorCode:'budget'});
  expect(calls).toBe(1); hold.resolve(); await first;
});

it('meters success, invalid output, exception and abort exactly once and releases reservations for retries', async () => {
  const {store, admission} = setup();
  const cases: ProviderAdapter['stream'][] = [
    async function* () { yield {type:'text-delta',text:'valid'}; yield {type:'done'}; },
    async function* () { yield {type:'tool-call',call:{toolCallId:'x',toolName:'run',args:{}}}; },
    async function* () { yield* []; throw new Error('offline'); },
    async function* (_request,signal) { signal.throwIfAborted(); yield {type:'done'}; },
  ];
  for (const [index,stream] of cases.entries()) {
    const controller = new AbortController();
    const provider = adapter(index === 3 ? async function* (r,s) { controller.abort(); yield* stream(r,s); } : stream);
    await admission.execute({purpose:'extraction',request:request(),adapter:provider,outputTokens:30},controller.signal).catch(() => {});
  }
  expect(store.usage.summary('month').calls).toBe(4);
  expect(admission.inFlight).toEqual({calls:0,inputTokens:0,outputTokens:0,costUsd:0});
  expect(await admission.execute({purpose:'generation',request:request(),adapter:adapter(cases[0]!),outputTokens:30},new AbortController().signal)).toBe('valid');
  expect(store.usage.summary('month').calls).toBe(5);
});

it('uses reported partial usage on failure and forces no tools with an adapter output bound', async () => {
  const records: UsageRecord[] = []; let received: ProviderRequest | undefined;
  const admission = new ReviewAdmission({settings:{get:()=>({priceOverrides:{}})},usage:{summary:()=>({inputTokens:0,outputTokens:0,costUsd:0,calls:0,unknownPrices:0,groups:[]}),record:r=>records.push(r)}});
  const provider = adapter(async function* (r) {
    received = r;
    r.onUsageSnapshot?.({inputTokens:120,outputTokens:9,costUsd:.03,costSource:'reported'});
    yield {type:'error',message:'failure'};
  });
  await expect(admission.execute({purpose:'generation',request:{...request(),allowPresentation:true},adapter:provider,outputTokens:42},new AbortController().signal)).rejects.toThrow();
  expect(received).toMatchObject({allowPresentation:false,maxOutputTokens:42});
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({kind:'chat',inputTokens:120,outputTokens:9,costUsd:.03,costSource:'reported'});
});

it('rejects oversized or incomplete responses while recording dispatched usage', async () => {
  const {store, admission} = setup();
  for (const events of [[{type:'text-delta',text:'中文中文'}], [{type:'text-delta',text:'ok'}]] satisfies ChatEvent[][]) {
    const provider = adapter(async function* () { yield* events; });
    await expect(admission.execute({purpose:'extraction',request:request(),adapter:provider,maxOutputBytes:8},new AbortController().signal)).rejects.toThrow();
  }
  expect(store.usage.summary('month').calls).toBe(2);
});

it.each(['openai-api','anthropic-api','openai-compatible'] as const)('enforces output bounds in the %s adapter request', async providerId => {
  const {admission} = setup(); let body:Record<string,unknown> | undefined;
  const provider = createApiAdapter(() => providerId === 'openai-compatible' ? {kind:'compatible',id:providerId,enabled:true,baseUrl:'http://localhost:11434/v1'} : {kind:'api',id:providerId,enabled:true},{getInMainOnly:()=> 'test'},async (_input,init) => {
    body = JSON.parse(String(init?.body)) as Record<string,unknown>;
    return new Response('data: [DONE]\n\n');
  });
  await admission.execute({purpose:'extraction',request:{...request(),providerId},adapter:provider,outputTokens:123},new AbortController().signal).catch(() => {});
  expect(body?.[providerId === 'openai-api' ? 'max_completion_tokens' : 'max_tokens']).toBe(123);
  expect(body?.tools).toBeUndefined();
});
