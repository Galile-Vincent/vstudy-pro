import { useTranslation } from "react-i18next";
import { tr } from '../../shared/i18n';
import { useEffect, useState } from 'react';
import { priceSchema, type Settings, type IpcResponse } from '../../shared';
import { z } from 'zod';
import { desktop } from '../bridge';
import { UsageDashboard } from './dashboard';
const balanceNote = tr('common:no_provider_exposes_an_account_balance_for_api_keys_left_means_your_user_set_monthly_budget_or_token_cap_provider_rate_limits_are_separate_and_appear_only_when_reported');
export function UsageSettings() {
  useTranslation();
  const [settings,setSettings] = useState<Settings>();
  const [limits,setLimits] = useState<IpcResponse<'usage:rateLimits'>>([]);
  const [documents,setDocuments] = useState<IpcResponse<'documents:list'>>([]);
  const [overrides,setOverrides] = useState('{}');
  const [status,setStatus] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([desktop.invoke('settings:get',{}),desktop.invoke('usage:rateLimits',{}), desktop.invoke('documents:list',{})]).then(([s,l,d]) => { if (active) { setSettings(s); setOverrides(JSON.stringify(s.priceOverrides,null,2)); setLimits(l); setDocuments(d); } }).catch(() => { if (active) setStatus(tr('common:could_not_load_usage')); });
    return () => { active = false; };
  },[]);
  const save = async () => {
    if (!settings) return;
    try {
      const priceOverrides = z.record(priceSchema).parse(JSON.parse(overrides));
      const latest = await desktop.invoke('settings:get',{});
      const saved = await desktop.invoke('settings:set', { ...latest, monthlyBudgetUsd: settings.monthlyBudgetUsd, monthlyTokenBudget: settings.monthlyTokenBudget, warnAtPercent: settings.warnAtPercent, priceOverrides });
      setSettings(saved); setStatus(tr('common:usage_settings_saved')); window.dispatchEvent(new Event('usage-updated'));
    } catch { setStatus(tr('common:check_positive_budgets_warning_percentage_1_100_and_price_json')); }
  };
  return <section className="usage-settings" aria-label={tr('common:usage_settings')}>
    <p className="muted">{balanceNote}</p>
    <UsageDashboard documents={documents} />
    <div><strong>{tr('common:provider_rate_limits')}</strong>{!limits.length && <p className="muted">{tr('common:no_rate_limit_information_reported_yet_codex_cli_does_not_report_rate_limits_through_exec_its_account_probe_may_be_unavailable_claude_limits_appear_when_reported')}</p>}{limits.map(l => <p key={l.providerId}>{l.providerId}: {l.rateLimit.usedPercent === undefined ? '' : `${l.rateLimit.usedPercent}% of `}{l.rateLimit.label}{l.rateLimit.remainingTokens !== undefined ? ` · ${l.rateLimit.remainingTokens} tokens left` : ''}{l.rateLimit.remainingRequests !== undefined ? ` · ${l.rateLimit.remainingRequests} requests left` : ''}{l.rateLimit.resetsAt ? ` · resets ${new Date(l.rateLimit.resetsAt).toLocaleString()}` : ''}<small> {tr('common:reported')}{new Date(l.createdAt).toLocaleString()}</small></p>)}</div>
    {settings && <><div className="usage-budget-inputs">
      <label>{tr('common:monthly_budget_usd')}<input aria-label={tr('common:monthly_budget_usd')} type="number" min="0.01" step="0.01" value={settings.monthlyBudgetUsd ?? ''} onChange={e => setSettings({...settings,monthlyBudgetUsd:e.target.value ? Number(e.target.value) : undefined})}/></label>
      <label>{tr('common:monthly_token_cap')}<input aria-label={tr('common:monthly_token_cap')} type="number" min="1" step="1" value={settings.monthlyTokenBudget ?? ''} onChange={e => setSettings({...settings,monthlyTokenBudget:e.target.value ? Number(e.target.value) : undefined})}/></label>
      <label>{tr('common:warn_at')}<input aria-label={tr('common:warn_at')} type="number" min="1" max="100" value={settings.warnAtPercent} onChange={e => setSettings({...settings,warnAtPercent:Number(e.target.value)})}/></label>
    </div><label>{tr('common:price_overrides_usd_per_1m_tokens')}<textarea aria-label={tr('common:price_overrides')} rows={5} value={overrides} onChange={e => setOverrides(e.target.value)} spellCheck={false}/></label>
    <p className="muted">{tr('common:json_keyed_by_exact_model_id_e_g')}{`{"my-model":{"input":2,"output":10,"cacheRead":0.1,"cacheWrite":2.5}}`}{tr('common:standard_global_defaults_verified_nov_3_2026_estimates_exclude_taxes_tools_and_special_service_tiers_cache_writes_assume_5_minutes_cli_costs_are_api_equivalent_subscription_not_subscription_charges')}</p>
    <div className="row"><button onClick={() => void save()}>{tr('common:save_usage_settings')}</button><button onClick={() => { void desktop.invoke('usage:export',{}).then(r => setStatus(r.saved ? tr('common:csv_exported') : tr('common:export_canceled'))).catch(() => setStatus(tr('common:export_failed'))); }}>{tr('common:export_csv')}</button></div></>}
    {status && <p role="status">{status}</p>}
  </section>;
}
