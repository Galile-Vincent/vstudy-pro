/**
 * Normalize provider model identifiers and distinguish reported costs from estimates.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import type { Price, Usage } from '../shared/domain';
// Standard global rates, verified 2026-11-03; overrides cover negotiated and nonstandard tiers.
export const pricingSources = ['https://platform.claude.com/docs/en/about-claude/pricing', 'https://developers.openai.com/api/docs/models/gpt-5.4', 'https://developers.openai.com/api/docs/models/gpt-6.1-sol', 'https://developers.openai.com/api/docs/models/gpt-6-sol'];
export const prices: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: .25, cacheWrite: 12.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: .2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: .1, output: .5, cacheRead: .01, cacheWrite: .125 },
  'gpt-6.1-sol': { input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5 },
  'gpt-6-sol': { input: 2, output: 10, cacheRead: .2, cacheWrite: 2.5 },
  // https://developers.openai.com/api/docs/models/gpt-6-luna — verified 2026-11-03, Standard short context.
  'gpt-6-luna': { input: .1, output: .5, cacheRead: .01, cacheWrite: .125 },
  // https://developers.openai.com/api/docs/models/gpt-6-astra — verified 2026-11-03, Standard short context.
  'gpt-6-astra': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  // https://developers.openai.com/api/docs/models/gpt-6.1-terra — verified 2026-11-03, Standard short context.
  'gpt-6.1-terra': { input: 1, output: 5, cacheRead: .05, cacheWrite: 1.25 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: .25, cacheWrite: 2.5 },
};
/** Normalize provider aliases before looking up model prices or recording usage. */
export function canonicalModelId(model: string): string {
  return ({ haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' } as Record<string,string>)[model] ?? model;
}
/** Estimate USD cost from known token prices; preserve unknown prices as unknown. */
export function estimateCost(model: string, usage: Usage, overrides: Record<string, Price> = {}): number | undefined {
  model = canonicalModelId(model);
  let p = overrides[model] ?? prices[model];
  if (!p) return undefined;
  if (model === 'claude-haiku-5-5' && !overrides[model] && usage.inputTokens > 100_000)
    p = { input: .5, output: 2.5, cacheRead: .05, cacheWrite: .625 };
  if (['gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.4', 'gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-terra'].includes(model) && usage.inputTokens > 272_000 && !overrides[model]) p = { input: p.input * 2, output: p.output * 1.5, cacheRead: p.cacheRead * 2, cacheWrite: p.cacheWrite * 2 };
  // Claude 1-hour cache writes cost more than this 5-minute table; estimates are approximate. Prefer reported cost.
  // Input includes cache tokens; reasoning tokens are already included in output.
  return (Math.max(0, usage.inputTokens - (usage.cacheReadTokens ?? 0) - (usage.cacheWriteTokens ?? 0)) * p.input + usage.outputTokens * p.output + (usage.cacheReadTokens ?? 0) * p.cacheRead + (usage.cacheWriteTokens ?? 0) * p.cacheWrite) / 1_000_000;
}
/** Preserve provider-reported cost and estimate only when the provider did not report a cost. */
export function priceUsage(model: string, usage: Usage, overrides: Record<string, Price> = {}): Usage {
  if (usage.costSource === 'reported' && usage.costUsd !== undefined) return usage;
  const costUsd = estimateCost(model, usage, overrides);
  return { ...usage, costUsd, costSource: costUsd === undefined ? (usage.costSource === 'estimated' ? 'estimated' : 'unknown') : 'estimated' };
}
