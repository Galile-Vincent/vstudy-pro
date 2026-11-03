import { useTranslation } from "react-i18next";
import { i18n, tr } from '../../shared/i18n';
import { usageSchema, type Usage, type Model } from '../../shared';
import { useAuiState } from '@assistant-ui/react';
import './usage.css';
import { effortLabel } from '../model-picker';
export const compactTokens = (n: number) => new Intl.NumberFormat(i18n.language === 'en-XA' ? 'en' : i18n.language,{notation:'compact',maximumFractionDigits:1}).format(n);
export const money = (n?: number): string => n === undefined ? tr('common:price_unknown') : n > 0 && n < .001 ? `<${money(.001)}` : new Intl.NumberFormat(i18n.language === 'en-XA' ? 'en' : i18n.language,{style:'currency',currency:'USD',minimumFractionDigits:n > 0 && n < .01 ? 0 : 3,maximumFractionDigits:n > 0 && n < .01 ? 5 : 3}).format(n);
export function UsageChip({ usage, subscription = false, aborted = false }: { usage: Usage; subscription?: boolean; aborted?: boolean }) {
  useTranslation();
  return <span className="usage-chip" title={tr('usage:cache_detail',{read:compactTokens(usage.cacheReadTokens ?? 0),write:compactTokens(usage.cacheWriteTokens ?? 0),reasoning:compactTokens(usage.reasoningTokens ?? 0)})}>
    {usage.costSource === 'unknown' && usage.inputTokens === 0 && usage.outputTokens === 0 ? tr('common:tokens_unavailable') : tr('usage:token_flow',{input:compactTokens(usage.inputTokens),output:compactTokens(usage.outputTokens)})} · {money(usage.costUsd)}{subscription && ` · ${tr('usage:subscription')}`}{aborted && ` · ${tr('usage:aborted')}`}
  </span>;
}
export function MessageUsage({ subscription, models = [], fallbackUsage }: { subscription: boolean; models?: Model[]; fallbackUsage?: Usage | undefined }) {
  useTranslation();
  const aborted = useAuiState(s => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled");
  const value = useAuiState(s => s.message.metadata.custom.usage);
  const modelId = useAuiState(s => s.message.metadata.custom.modelId);
  const options = useAuiState(s => s.message.metadata.custom.options);
  const model = models.find(m => m.id === modelId || m.resolvedId === modelId);
  const labels = Object.entries((options ?? {}) as Record<string,string|boolean>).flatMap(([id,value]) => {
    const declared = model?.options?.find(o => o.id === id);
    if (value === false || value === 'false' || value === 'default' || String(value) === declared?.default) return [];
    if (/effort/i.test(id)) return [effortLabel(String(value))];
    if (id === 'fastMode' && String(value) === 'true' || id === 'serviceTier' && value === 'priority') return [tr('common:fast')];
    return declared ? [declared.values.find(v => v.id === String(value))?.label ?? declared.label] : [];
  });
  const label = [model?.name, ...labels].filter(Boolean).join(' · ');
  const parsed = usageSchema.safeParse(value);
  const usage = parsed.success ? parsed.data : fallbackUsage;
  return usage ? <><small className="usage-chip">{label && `${label} · `}</small><UsageChip usage={usage} subscription={subscription} aborted={aborted} /></> : null;
}
