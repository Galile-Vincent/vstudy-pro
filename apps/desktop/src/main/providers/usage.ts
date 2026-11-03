import { z } from 'zod';
import { usageSchema, type Usage } from '../../shared/domain';
const counts = z.object({
  input_tokens: z.number().int().nonnegative().optional(), output_tokens: z.number().int().nonnegative().optional(),
  prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(),
  cached_input_tokens: z.number().int().nonnegative().optional(), cache_read_input_tokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(), cache_write_input_tokens: z.number().int().nonnegative().optional(),
  reasoning_output_tokens: z.number().int().nonnegative().optional(),
  prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).optional(),
  completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().optional() }).optional(),
  output_tokens_details: z.object({ thinking_tokens: z.number().int().nonnegative().optional() }).optional(),
});
const windowSchema = z.object({ used_percent: z.number().min(0).max(100), window_minutes: z.number().optional(), resets_at: z.number().optional() });
export function extractUsage(data: string, kind: string, previous?: Usage): Usage | undefined {
  if (data === '[DONE]') return previous;
  const wire = z.object({ type: z.string().optional(), event: z.unknown().optional(), message: z.object({ usage: counts.optional() }).optional(), usage: counts.nullable().optional(), total_cost_usd: z.number().finite().nonnegative().optional(),
    info: z.object({ total_token_usage: counts.optional(), last_token_usage: counts.optional() }).nullable().optional(),
    rate_limits: z.object({ primary: windowSchema.nullable().optional(), secondary: windowSchema.nullable().optional() }).nullable().optional(),
    payload: z.unknown().optional(),
  }).parse(JSON.parse(data));
  if (wire.type === 'stream_event') return extractUsage(JSON.stringify(wire.event), 'anthropic', previous);
  if (wire.type === 'event_msg' && wire.payload) return extractUsage(JSON.stringify(wire.payload), kind, previous);
  const c = wire.usage ?? wire.message?.usage ?? wire.info?.total_token_usage;
  let usage = previous;
  if (c) {
    const read = c.cache_read_input_tokens ?? c.cached_input_tokens ?? c.prompt_tokens_details?.cached_tokens;
    const write = c.cache_creation_input_tokens ?? c.cache_write_input_tokens;
    const input = c.input_tokens ?? c.prompt_tokens;
    usage = usageSchema.parse({ ...previous,
      inputTokens: input === undefined ? previous?.inputTokens ?? 0 : input + (kind === 'anthropic' || kind === 'claude' ? (read ?? 0) + (write ?? 0) : 0),
      outputTokens: c.output_tokens ?? c.completion_tokens ?? previous?.outputTokens ?? 0,
      cacheReadTokens: read ?? previous?.cacheReadTokens, cacheWriteTokens: write ?? previous?.cacheWriteTokens,
      reasoningTokens: c.reasoning_output_tokens ?? c.completion_tokens_details?.reasoning_tokens ?? c.output_tokens_details?.thinking_tokens ?? previous?.reasoningTokens,
      costUsd: wire.total_cost_usd ?? previous?.costUsd, costSource: wire.total_cost_usd === undefined ? previous?.costSource ?? 'unknown' : 'reported',
    });
  }
  const windows = [wire.rate_limits?.primary, wire.rate_limits?.secondary].filter(w => w != null);
  if (windows.length) {
    const w = windows.reduce((a,b) => a.used_percent >= b.used_percent ? a : b);
    usage = usageSchema.parse({ inputTokens: 0, outputTokens: 0, costSource: 'unknown', ...usage, rateLimit: { label: `${w.window_minutes ?? 'unknown'} minute window`, usedPercent: w.used_percent, ...(w.resets_at ? { resetsAt: new Date(w.resets_at * 1000).toISOString() } : {}) } });
  }
  return usage;
}
export function headerRateLimit(headers: Headers, anthropic: boolean): Usage['rateLimit'] {
  const prefix = anthropic ? 'anthropic-ratelimit-' : 'x-ratelimit-';
  const number = (key: string) => { const v = headers.get(prefix + key); return v !== null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined; };
  const remainingTokens = number(anthropic ? 'tokens-remaining' : 'remaining-tokens');
  const remainingRequests = number(anthropic ? 'requests-remaining' : 'remaining-requests');
  const reset = headers.get(prefix + (anthropic ? 'tokens-reset' : 'reset-tokens'));
  let resetsAt: string | undefined;
  if (reset) {
    const duration = [...reset.matchAll(/([\d.]+)(ms|s|m|h)/g)].reduce((sum,m) => sum + Number(m[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2]!] ?? 0), 0);
    const date = duration ? Date.now() + duration : Date.parse(reset);
    if (Number.isFinite(date)) resetsAt = new Date(date).toISOString();
  }
  return remainingTokens === undefined && remainingRequests === undefined && !resetsAt ? undefined : { label: 'Provider rate limit', remainingTokens, remainingRequests, resetsAt };
}
export function cliModelUsage(data: string): { modelId: string; usage: Usage }[] | undefined {
  if (data === '[DONE]') return undefined;
  const result = z.object({ type: z.string().optional(), modelUsage: z.record(z.object({
    inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
    cacheReadInputTokens: z.number().int().nonnegative(), cacheCreationInputTokens: z.number().int().nonnegative(),
    thinkingTokens: z.number().int().nonnegative().optional(), costUSD: z.number().finite().nonnegative(),
  })).optional() }).parse(JSON.parse(data));
  if (result.type !== 'result' || !result.modelUsage) return undefined;
  return Object.entries(result.modelUsage).map(([modelId,u]) => ({ modelId, usage: { inputTokens: u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadInputTokens, cacheWriteTokens: u.cacheCreationInputTokens, reasoningTokens: u.thinkingTokens, costUsd: u.costUSD, costSource: 'reported' } }));
}
