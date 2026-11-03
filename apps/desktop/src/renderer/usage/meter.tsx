import { useTranslation } from "react-i18next";
import { tr } from '../../shared/i18n';
import { useEffect, useState, useRef, type SyntheticEvent } from 'react';
import type { Conversation, Settings, UsageRecord, UsageSummary } from '../../shared';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
import { budgetState } from './budget';
export function useUsage(conversationId: Conversation['id']) {
  useTranslation();
  const [data,setData] = useState<{ settings: Settings; month: UsageSummary; records: UsageRecord[] }>();
  const [error,setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => { void Promise.all([desktop.invoke('settings:get', {}), desktop.invoke('usage:summary', { period: 'month' }), desktop.invoke('usage:forConversation', { conversationId })]).then(([settings,month,records]) => { if (active) { setData({ settings, month, records }); setError(''); } }).catch(() => { if (active) setError(tr('common:usage_unavailable')); }); };
    refresh(); window.addEventListener('usage-updated', refresh); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('usage-updated',refresh); window.removeEventListener('focus',refresh); };
  }, [conversationId]);
  return { data,error };
}
export function UsageButton({ data, error, onClick }: ReturnType<typeof useUsage> & { onClick: () => void }) {
  useTranslation();
  const records = data?.records ?? [];
  const tokens = records.reduce((n,r) => n + r.inputTokens + r.outputTokens,0);
  const known = records.filter(r => r.costUsd !== undefined);
  const cost = known.reduce((n,r) => n + r.costUsd!,0);
  const description = `${tr('usage:token_count',{count:compactTokens(tokens)})}${known.length ? ` · ${money(cost)}` : ''}${records.some(r => r.aborted) ? tr('common:includes_aborted_turns') : ''}`;
  return <button type="button" className="composer-usage" onClick={onClick} aria-label={tr('common:conversation_usage')} title={data ? `${description} · ${tr('common:view_usage_and_budget_settings')}` : tr('common:view_usage_and_budget_settings')}>{error || (!data ? tr('usage:usage_loading') : <><span className="usage-full">{description}</span><span className="usage-compact" aria-hidden>{compactTokens(tokens)}</span></>)}</button>;
}
export function UsageMeter({ data, error }: ReturnType<typeof useUsage>) {
  useTranslation();
  const [priceUnknown,setPriceUnknown] = useState(false);
  useEffect(() => { const update = (event: Event) => setPriceUnknown(Boolean((event as CustomEvent).detail)); window.addEventListener('usage-price-unknown',update); return () => window.removeEventListener('usage-price-unknown',update); },[]);
  if (!data) return error ? <small className="usage-meter">{error}</small> : null;
  const { settings,month } = data;
  const state = budgetState(settings,month);
  if (!state.percent && !month.unknownPrices && !priceUnknown) return null;
  return <div className={`usage-meter ${state.tone}`}>

    {(settings.monthlyBudgetUsd || settings.monthlyTokenBudget) && <><span>{tr('common:month')}{money(month.costUsd ?? (month.calls ? undefined : 0))}{settings.monthlyBudgetUsd ? tr('usage:money_left',{used:'',budget:money(settings.monthlyBudgetUsd),left:money(Math.max(0,settings.monthlyBudgetUsd - (month.costUsd ?? 0)))}) : ''}{settings.monthlyTokenBudget ? tr('usage:token_left',{used:compactTokens(state.tokens),budget:compactTokens(settings.monthlyTokenBudget),left:compactTokens(Math.max(0,settings.monthlyTokenBudget - state.tokens))}) : ''}</span><progress aria-label={tr('common:monthly_budget_used')} value={Math.min(100,state.percent)} max={100} /></>}
    {(priceUnknown || month.unknownPrices > 0) && <small>{tr('common:price_unknown_this_call_isn_t_counted_toward_the_usd_budget')}</small>}
  </div>;
}
export function useBudgetGuard(data: ReturnType<typeof useUsage>['data'], conversationId: Conversation['id'], draft: string) {
  useTranslation();
  const [warning,setWarning] = useState(false);
  const allow = useRef(false);
  const checking = useRef(false);
  const form = useRef<HTMLFormElement | null>(null);
  const [reason,setReason] = useState('');
  const approve = () => { allow.current = true; setWarning(false); form.current?.requestSubmit(); };
  const guard = (event: SyntheticEvent) => {
    if (allow.current) { allow.current = false; return; }
    if (data && !data.settings.monthlyBudgetUsd && !data.settings.monthlyTokenBudget) return;
    event.preventDefault(); event.stopPropagation();
    form.current = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : (event.currentTarget as HTMLElement).closest('form');
    if (checking.current) return;
    checking.current = true;
    void Promise.all([desktop.invoke('usage:estimate',{conversationId,userMessage:draft}), desktop.invoke('usage:summary',{period:'month'}), desktop.invoke('settings:get',{})]).then(([next,month,settings]) => {
      const exceeds = budgetState(next.costUsd === undefined ? {...settings,monthlyBudgetUsd:undefined} : settings,month,{tokens:next.inputTokens + next.outputTokens,costUsd:next.costUsd ?? 0}).exceeds;
      window.dispatchEvent(new CustomEvent('usage-price-unknown',{detail:next.costUsd === undefined}));
      if (exceeds) {
        setReason(tr('common:the_next_request_may_exceed_your_monthly_budget')); setWarning(true);
      } else approve();
    }).catch(() => { setReason(tr('common:could_not_check_your_budget')); setWarning(true); }).finally(() => { checking.current = false; });
  };
  return { guard, warning, reason, dismiss: () => setWarning(false), approve };
}
