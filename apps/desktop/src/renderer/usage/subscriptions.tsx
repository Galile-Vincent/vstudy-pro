import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { tr } from '../../shared/i18n';
import type { SubscriptionUsage } from '../../shared/subscription-usage';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { SubscriptionWindowMeter } from './meter';
import './usage.css';

const providerName = (provider: SubscriptionUsage['provider']) => provider === 'claude' ? 'Claude' : 'Codex';

let keychainAllowed = false;

export function SubscriptionMeters({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
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
  return <section className="subscription-meters" data-compact={compact} aria-label={tr('usage:subscription_limits')} aria-busy={loading}>
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
      void desktop.invoke('usage:subscriptions', { allowClaudeKeychain, refresh: true }).then(value => { setRows(value); setError(false); }).catch(() => setError(true)).finally(() => setLoading(false));
    }}/>{tr('usage:quota_keychain')}</label>}
  </section>;
}
