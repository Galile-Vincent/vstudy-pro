import { usageSchema, type Usage, type Model } from '../../shared';
import { useAuiState } from '@assistant-ui/react';
import './usage.css';
import { effortLabel } from '../model-picker';
export const compactTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
export const money = (n?: number) => n === undefined ? 'price unknown' : n > 0 && n < .001 ? '<$0.001' : n > 0 && n < .01 ? `$${Number(n.toPrecision(3))}` : `$${n.toFixed(3)}`;
export function UsageChip({ usage, subscription = false, aborted = false }: { usage: Usage; subscription?: boolean; aborted?: boolean }) {
  return <span className="usage-chip" title={`Cache read ${usage.cacheReadTokens ?? 0} · cache write ${usage.cacheWriteTokens ?? 0} · reasoning ${usage.reasoningTokens ?? 0} · cost ${usage.costSource}${subscription ? ' · API-equivalent (subscription)' : ''}`}>
    {usage.costSource === "unknown" && usage.inputTokens === 0 && usage.outputTokens === 0 ? "tokens unavailable" : `in ${compactTokens(usage.inputTokens)} · out ${compactTokens(usage.outputTokens)}`} · {money(usage.costUsd)}{subscription && ' · API-equivalent (subscription)'}{aborted && ' · aborted'}
  </span>;
}
export function MessageUsage({ subscription, models = [], fallbackUsage }: { subscription: boolean; models?: Model[]; fallbackUsage?: Usage | undefined }) {
  const aborted = useAuiState(s => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled");
  const value = useAuiState(s => s.message.metadata.custom.usage);
  const modelId = useAuiState(s => s.message.metadata.custom.modelId);
  const options = useAuiState(s => s.message.metadata.custom.options);
  const model = models.find(m => m.id === modelId || m.resolvedId === modelId);
  const labels = Object.entries((options ?? {}) as Record<string,string|boolean>).flatMap(([id,value]) => {
    const declared = model?.options?.find(o => o.id === id);
    if (value === false || value === 'false' || value === 'default' || String(value) === declared?.default) return [];
    if (/effort/i.test(id)) return [`${effortLabel(String(value))} effort`];
    if (id === 'fastMode' && String(value) === 'true' || id === 'serviceTier' && value === 'priority') return ['Fast'];
    return declared ? [declared.values.find(v => v.id === String(value))?.label ?? declared.label] : [];
  });
  const label = [model?.name, ...labels].filter(Boolean).join(' · ');
  const parsed = usageSchema.safeParse(value);
  const usage = parsed.success ? parsed.data : fallbackUsage;
  return usage ? <><small className="usage-chip">{label && `${label} · `}</small><UsageChip usage={usage} subscription={subscription} aborted={aborted} /></> : null;
}
