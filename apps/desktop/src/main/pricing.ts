import type { Price, Usage } from '../shared/domain';
// Standard global rates, verified 2026-11-03; overrides cover negotiated and nonstandard tiers.
export const pricingSources = ['https://platform.claude.com/docs/en/about-claude/pricing', 'https://developers.openai.com/api/docs/models/gpt-5.4'];
export const prices: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: .25, cacheWrite: 12.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: .2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: .1, output: .5, cacheRead: .01, cacheWrite: .125 },
  'gpt-6.1-sol': { input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5 },
  'gpt-6-sol': { input: 2, output: 10, cacheRead: .2, cacheWrite: 2.5 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: .25, cacheWrite: 2.5 },
};
export function estimateCost(model: string, usage: Usage, overrides: Record<string, Price> = {}): number | undefined {
  let p = overrides[model] ?? prices[model];
  if (!p) return undefined;
  if (model === 'claude-haiku-5-5' && !overrides[model] && usage.inputTokens > 100_000)
    p = { input: .5, output: 2.5, cacheRead: .05, cacheWrite: .625 };
  if (['gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.4'].includes(model) && usage.inputTokens > 272_000 && !overrides[model]) p = { input: p.input * 2, output: p.output * 1.5, cacheRead: p.cacheRead * 2, cacheWrite: p.cacheWrite * 2 };
  // Input includes cache tokens; reasoning tokens are already included in output.
  return (Math.max(0, usage.inputTokens - (usage.cacheReadTokens ?? 0) - (usage.cacheWriteTokens ?? 0)) * p.input + usage.outputTokens * p.output + (usage.cacheReadTokens ?? 0) * p.cacheRead + (usage.cacheWriteTokens ?? 0) * p.cacheWrite) / 1_000_000;
}
export function priceUsage(model: string, usage: Usage, overrides: Record<string, Price> = {}): Usage {
  if (usage.costSource === 'reported' && usage.costUsd !== undefined) return usage;
  const costUsd = estimateCost(model, usage, overrides);
  return { ...usage, costUsd, costSource: costUsd === undefined ? (usage.costSource === 'estimated' ? 'estimated' : 'unknown') : 'estimated' };
}
