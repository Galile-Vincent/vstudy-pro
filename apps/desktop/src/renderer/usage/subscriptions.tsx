import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { tr } from '../../shared/i18n';
import type { SubscriptionUsage } from '../../shared/subscription-usage';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { SubscriptionWindowMeter } from './meter';
import './usage.css';

const providerName = (provider: SubscriptionUsage['provider']) => provider === 'claude' ? 'Claude' : 'Codex';

const expandedKey = 'vstudy-subscription-meters-expanded';
let keychainAllowed = false;

export function SubscriptionMeters({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const regionId = useId();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(expandedKey) === 'true'; } catch { return false; }
  });
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(expandedKey, String(next)); } catch { /* Storage may be disabled. */ }
  };
  const [rows, setRows] = useState<SubscriptionUsage[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [keychain, setKeychain] = useState(keychainAllowed);
  useEffect(() => {
    let active = true;
    const refresh = (event?: Event) => {
      setLoading(true);
      void desktop.invoke('usage:subscriptions', { refresh: event?.type === 'subscription-refresh', allowClaudeKeychain: keychainAllowed }).then(value => {
        if (active) { setRows(value); setError(false); }
      }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    window.addEventListener('subscription-refresh', refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener('subscription-refresh', refresh); };
  }, []);
  const highest = error ? undefined : rows?.filter(row => row.status === 'ready')
    .flatMap(row => row.windows.map(window => ({ ...window, provider: row.provider })))
    .sort((a, b) => b.usedPercent - a.usedPercent
      || (a.resetsAt ? Date.parse(a.resetsAt) : Infinity)
        - (b.resetsAt ? Date.parse(b.resetsAt) : Infinity)
      || a.provider.localeCompare(b.provider)
      || a.label.localeCompare(b.label))[0];
  const summaryLabel = highest ? tr('usage:quota_window_label', {
    provider: providerName(highest.provider),
    window: tr(highest.label === '5h' ? 'usage:quota_5h' : 'usage:quota_weekly'),
  }) : tr('usage:quota_summary');
  const unavailable = rows?.filter(row => row.status !== 'ready').length ?? 0;
  const summaryValue = highest ? tr('usage:quota_window_used', {
    label: summaryLabel, percent: Math.round(highest.usedPercent),
  }) : tr('usage:quota_unknown');
  return <section className="subscription-meters" data-compact={compact} aria-label={tr('usage:subscription_limits')} aria-busy={loading}>
    {compact && <div className="subscription-summary">
      <span className="subscription-summary-label">{summaryLabel}</span>
      <span className="subscription-summary-percent">{highest ? `${Math.round(highest.usedPercent)}%` : '—'}</span>
      <Progress className="subscription-progress" value={highest?.usedPercent ?? 0} aria-label={summaryLabel} aria-valuenow={highest?.usedPercent} aria-valuetext={summaryValue} />
      {(error || unavailable > 0) && <small className="subscription-summary-unavailable">
        {error ? tr('usage:quota_unavailable') : tr('usage:quota_unavailable_count', { count: unavailable })}
      </small>}
      <Button variant="ghost" size="icon" aria-expanded={expanded} aria-controls={regionId} aria-label={tr(expanded ? 'usage:quota_collapse' : 'usage:quota_expand')} onClick={toggle}>
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </Button>
    </div>}
    <div id={regionId} hidden={compact && !expanded} className={compact ? 'subscription-details' : undefined} tabIndex={compact ? 0 : undefined}>
    <header><strong>{tr('usage:subscription_limits')}</strong><Button variant="ghost" size="icon" disabled={loading} aria-label={tr('common:refresh_usage')} onClick={() => window.dispatchEvent(new Event('subscription-refresh'))}><RefreshCw size={14} aria-hidden="true"/></Button></header>
    {error ? <small role="status">{tr('usage:quota_unavailable')}</small> : !rows ? <small role="status">{tr('usage:usage_loading')}</small> : rows.map(row => <div key={row.provider} className="subscription-provider">
      <div className="subscription-provider-name">{providerName(row.provider)}{row.status !== 'ready' && <small>{tr(`usage:quota_${row.status}`)}</small>}</div>
      <div className="subscription-windows">{(['5h', 'weekly'] as const).map(label => {
        const window = row.windows.find(window => window.label === label);
        const title = window?.resetsAt ? `${tr('usage:quota_resets')} ${new Date(window.resetsAt).toLocaleString(i18n.language)}` : undefined;
        return <div key={label} title={title}>{window ? <SubscriptionWindowMeter label={`${providerName(row.provider)} ${tr(label === '5h' ? 'usage:quota_5h' : 'usage:quota_weekly')}`} usedPercent={window.usedPercent}/> : <small>{tr(label === '5h' ? 'usage:quota_5h' : 'usage:quota_weekly')} · {tr('usage:quota_unknown')}</small>}{!compact && title && <small>{title}</small>}</div>;
      })}</div>
      {!compact && row.fetchedAt && <small>{tr('usage:quota_updated')} {new Date(row.fetchedAt).toLocaleString(i18n.language)}</small>}
    </div>)}
    {!compact && <label className="subscription-consent"><input type="checkbox" checked={keychain} onChange={event => {
      const allowClaudeKeychain = event.target.checked;
      keychainAllowed = allowClaudeKeychain;
      setKeychain(allowClaudeKeychain);
      setLoading(true);
      void desktop.invoke('usage:subscriptions', { allowClaudeKeychain, refresh: true }).then(setRows).catch(() => setError(true)).finally(() => setLoading(false));
    }}/>{tr('usage:quota_keychain')}</label>}
    </div>
  </section>;
}
