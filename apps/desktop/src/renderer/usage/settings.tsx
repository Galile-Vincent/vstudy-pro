import { useEffect, useState } from 'react';
import { priceSchema, type Settings, type UsageSummary, type IpcResponse } from '../../shared';
import { z } from 'zod';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
const balanceNote = 'No provider exposes an account balance for API keys. “Left” means your user-set monthly budget or token cap. Provider rate limits are separate and appear only when reported.';
export function UsageSettings() {
  const [settings,setSettings] = useState<Settings>();
  const [month,setMonth] = useState<UsageSummary>();
  const [recent,setRecent] = useState<UsageSummary>();
  const [limits,setLimits] = useState<IpcResponse<'usage:rateLimits'>>([]);
  const [documents,setDocuments] = useState<IpcResponse<'documents:list'>>([]);
  const [overrides,setOverrides] = useState('{}');
  const [status,setStatus] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([desktop.invoke('settings:get',{}),desktop.invoke('usage:summary',{period:'month'}),desktop.invoke('usage:summary',{period:'last30days'}),desktop.invoke('usage:rateLimits',{}), desktop.invoke('documents:list',{})]).then(([s,m,r,l,d]) => { if (active) { setSettings(s); setOverrides(JSON.stringify(s.priceOverrides,null,2)); setMonth(m); setRecent(r); setLimits(l); setDocuments(d); } }).catch(() => { if (active) setStatus('Could not load usage'); });
    return () => { active = false; };
  },[]);
  const save = async () => {
    if (!settings) return;
    try {
      const priceOverrides = z.record(priceSchema).parse(JSON.parse(overrides));
      const latest = await desktop.invoke('settings:get',{});
      const saved = await desktop.invoke('settings:set', { ...latest, monthlyBudgetUsd: settings.monthlyBudgetUsd, monthlyTokenBudget: settings.monthlyTokenBudget, warnAtPercent: settings.warnAtPercent, priceOverrides });
      setSettings(saved); setStatus('Usage settings saved'); window.dispatchEvent(new Event('usage-updated'));
    } catch { setStatus('Check positive budgets, warning percentage (1–100), and price JSON.'); }
  };
  return <section className="usage-settings" aria-label="Usage settings">
    <p className="muted">{balanceNote}</p>
    <div className="row">{[['This month',month],['Last 30 days',recent]].map(([label,value]) => { const s = value as UsageSummary | undefined; return <div key={String(label)}><strong>{String(label)}</strong><p>{s ? `${compactTokens(s.inputTokens + s.outputTokens)} tokens · ${money(s.costUsd ?? (s.calls ? undefined : 0))} · ${s.calls} calls` : 'Loading…'}</p>{!!s?.unknownPrices && <small>{s.unknownPrices} calls with price unknown; total is a lower bound.</small>}</div>; })}</div>
    <div className="usage-breakdown"><table><caption>Month by provider, model and document</caption><thead><tr><th>Provider / model</th><th>Document</th><th>In / out</th><th>Cost</th></tr></thead><tbody>{month?.groups.map((g,i) => <tr key={i}><td>{g.providerId}<br/>{g.modelId}</td><td>{documents.find(d => d.id === g.documentId)?.title ?? g.documentId ?? '—'}</td><td>{compactTokens(g.inputTokens)} / {compactTokens(g.outputTokens)}</td><td>{money(g.costUsd)}{g.unknownPrices > 0 && ' + unknown'}{g.providerId.endsWith('-cli') && <small> API-equivalent (subscription)</small>}</td></tr>)}</tbody></table></div>
    <div><strong>Provider rate limits</strong>{!limits.length && <p className="muted">No rate-limit information reported yet.</p>}{limits.map(l => <p key={l.providerId}>{l.providerId}: {l.rateLimit.usedPercent === undefined ? '' : `${l.rateLimit.usedPercent}% of `}{l.rateLimit.label}{l.rateLimit.remainingTokens !== undefined ? ` · ${l.rateLimit.remainingTokens} tokens left` : ''}{l.rateLimit.remainingRequests !== undefined ? ` · ${l.rateLimit.remainingRequests} requests left` : ''}{l.rateLimit.resetsAt ? ` · resets ${new Date(l.rateLimit.resetsAt).toLocaleString()}` : ''}<small> · reported {new Date(l.createdAt).toLocaleString()}</small></p>)}</div>
    {settings && <><div className="usage-budget-inputs">
      <label>Monthly budget (USD)<input aria-label="Monthly budget (USD)" type="number" min="0.01" step="0.01" value={settings.monthlyBudgetUsd ?? ''} onChange={e => setSettings({...settings,monthlyBudgetUsd:e.target.value ? Number(e.target.value) : undefined})}/></label>
      <label>Monthly token cap<input aria-label="Monthly token cap" type="number" min="1" step="1" value={settings.monthlyTokenBudget ?? ''} onChange={e => setSettings({...settings,monthlyTokenBudget:e.target.value ? Number(e.target.value) : undefined})}/></label>
      <label>Warn at (%)<input aria-label="Warn at (%)" type="number" min="1" max="100" value={settings.warnAtPercent} onChange={e => setSettings({...settings,warnAtPercent:Number(e.target.value)})}/></label>
    </div><label>Price overrides (USD per 1M tokens)<textarea aria-label="Price overrides" rows={5} value={overrides} onChange={e => setOverrides(e.target.value)} spellCheck={false}/></label>
    <p className="muted">JSON keyed by exact model ID, e.g. {`{"my-model":{"input":2,"output":10,"cacheRead":0.1,"cacheWrite":2.5}}`}. Standard global defaults verified Nov 3, 2026. Estimates exclude taxes, tools and special service tiers; cache writes assume 5 minutes. CLI costs are API-equivalent (subscription), not subscription charges.</p>
    <div className="row"><button onClick={() => void save()}>Save usage settings</button><button onClick={() => { void desktop.invoke('usage:export',{}).then(r => setStatus(r.saved ? 'CSV exported' : 'Export canceled')).catch(() => setStatus('Export failed')); }}>Export CSV</button></div></>}
    {status && <p role="status">{status}</p>}
  </section>;
}
