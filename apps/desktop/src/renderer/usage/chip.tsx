import { usageSchema, type Usage } from '../../shared';
import { useAuiState } from '@assistant-ui/react';
import './usage.css';
export const compactTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
export const money = (n?: number) => n === undefined ? 'price unknown' : `$${n.toFixed(3)}`;
export function UsageChip({ usage, subscription = false }: { usage: Usage; subscription?: boolean }) {
  return <span className="usage-chip" title={`Cache read ${usage.cacheReadTokens ?? 0} · cache write ${usage.cacheWriteTokens ?? 0} · reasoning ${usage.reasoningTokens ?? 0} · cost ${usage.costSource}${subscription ? ' · API-equivalent (subscription)' : ''}`}>
    {usage.costSource === "unknown" && usage.inputTokens === 0 && usage.outputTokens === 0 ? "tokens unavailable" : `in ${compactTokens(usage.inputTokens)} · out ${compactTokens(usage.outputTokens)}`} · {money(usage.costUsd)}{subscription && ' · API-equivalent (subscription)'}
  </span>;
}
export function MessageUsage({ subscription }: { subscription: boolean }) {
  const value = useAuiState(s => s.message.metadata.custom.usage);
  const parsed = usageSchema.safeParse(value);
  return parsed.success ? <UsageChip usage={parsed.data} subscription={subscription} /> : null;
}
