import { useEffect, useState, useRef, type SyntheticEvent } from 'react';
import type { Conversation, Settings, UsageRecord, UsageSummary } from '../../shared';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
import { budgetState } from './budget';
export function useUsage(conversationId: Conversation['id']) {
  const [data,setData] = useState<{ settings: Settings; month: UsageSummary; records: UsageRecord[] }>();
  const [error,setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => { void Promise.all([desktop.invoke('settings:get', {}), desktop.invoke('usage:summary', { period: 'month' }), desktop.invoke('usage:forConversation', { conversationId })]).then(([settings,month,records]) => { if (active) { setData({ settings, month, records }); setError(''); } }).catch(() => { if (active) setError('Usage unavailable'); }); };
    refresh(); window.addEventListener('usage-updated', refresh); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('usage-updated',refresh); window.removeEventListener('focus',refresh); };
  }, [conversationId]);
  return { data,error };
}
export function UsageMeter({ data, error }: ReturnType<typeof useUsage>) {
  if (!data) return <small className="usage-meter">{error || 'Loading usage…'}</small>;
  const { records,settings,month } = data;
  const state = budgetState(settings,month);
  const known = records.filter(r => r.costUsd !== undefined);
  return <div className={`usage-meter ${state.tone}`}>
    <span>Conversation · {compactTokens(records.reduce((n,r) => n + r.inputTokens + r.outputTokens,0))} tokens · {money(known.length ? known.reduce((n,r) => n + r.costUsd!,0) : undefined)}{records.some(r => r.providerId.endsWith("-cli")) && " · API-equivalent (subscription)"}</span>
    {(settings.monthlyBudgetUsd || settings.monthlyTokenBudget) && <><span>Month · {money(month.costUsd ?? (month.calls ? undefined : 0))}{settings.monthlyBudgetUsd ? ` / $${settings.monthlyBudgetUsd} · $${Math.max(0,settings.monthlyBudgetUsd - (month.costUsd ?? 0)).toFixed(2)} left` : ''}{settings.monthlyTokenBudget ? ` · ${compactTokens(state.tokens)} / ${compactTokens(settings.monthlyTokenBudget)} tokens · ${compactTokens(Math.max(0,settings.monthlyTokenBudget - state.tokens))} left` : ''}</span><progress aria-label="Monthly budget used" value={Math.min(100,state.percent)} max={100} /></>}
    {month.unknownPrices > 0 && <span>Some prices unknown; spending is a lower bound.</span>}
  </div>;
}
export function useBudgetGuard(data: ReturnType<typeof useUsage>['data'], conversationId: Conversation['id'], draft: string) {
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
      const exceeds = budgetState(settings,month,{tokens:next.inputTokens + next.outputTokens,costUsd:next.costUsd ?? 0}).exceeds;
      if (exceeds || (settings.monthlyBudgetUsd && (next.costUsd === undefined || month.unknownPrices > 0))) {
        setReason(exceeds ? 'The next request may exceed your monthly budget.' : 'Some prices are unknown, so the next request cannot be checked against your USD budget.'); setWarning(true);
      } else approve();
    }).catch(() => { setReason('Could not check your budget.'); setWarning(true); }).finally(() => { checking.current = false; });
  };
  return { guard, warning, reason, dismiss: () => setWarning(false), approve };
}
