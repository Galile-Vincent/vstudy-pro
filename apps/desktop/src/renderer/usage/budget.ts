import type { Settings, UsageSummary } from '../../shared';
export function budgetState(settings: Settings, summary: Pick<UsageSummary, 'inputTokens' | 'outputTokens' | 'costUsd' | 'unknownPrices'>, next = { tokens: 0, costUsd: 0 }) {
  const tokens = summary.inputTokens + summary.outputTokens;
  const percent = Math.max(settings.monthlyBudgetUsd ? (summary.costUsd ?? 0) / settings.monthlyBudgetUsd * 100 : 0, settings.monthlyTokenBudget ? tokens / settings.monthlyTokenBudget * 100 : 0);
  return { tokens, percent, tone: percent >= 100 ? 'red' : percent >= settings.warnAtPercent ? 'amber' : 'normal',
    exceeds: !!((settings.monthlyBudgetUsd && (summary.costUsd ?? 0) + next.costUsd > settings.monthlyBudgetUsd) || (settings.monthlyTokenBudget && tokens + next.tokens > settings.monthlyTokenBudget)),
  };
}
