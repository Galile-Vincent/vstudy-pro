import { useEffect, useState } from 'react';
import { priceSchema, type Settings, type IpcResponse } from '../../shared';
import { z } from 'zod';
import { desktop } from '../bridge';
import { UsageDashboard } from './dashboard';
const balanceNote = 'No provider exposes an account balance for API keys. “Left” means your user-set monthly budget or token cap. Provider rate limits are separate and appear only when reported.';
export function UsageSettings() {
  const [settings,setSettings] = useState<Settings>();
  const [limits,setLimits] = useState<IpcResponse<'usage:rateLimits'>>([]);
  const [documents,setDocuments] = useState<IpcResponse<'documents:list'>>([]);
  const [overrides,setOverrides] = useState('{}');
  const [status,setStatus] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([desktop.invoke('settings:get',{}),desktop.invoke('usage:rateLimits',{}), desktop.invoke('documents:list',{})]).then(([s,l,d]) => { if (active) { setSettings(s); setOverrides(JSON.stringify(s.priceOverrides,null,2)); setLimits(l); setDocuments(d); } }).catch(() => { if (active) setStatus('Could not load usage'); });
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
    <UsageDashboard documents={documents} />
    <div><strong>Provider rate limits</strong>{!limits.length && <p className="muted">No rate-limit information reported yet. Codex CLI does not report rate limits through exec; its account probe may be unavailable. Claude limits appear when reported.</p>}{limits.map(l => <p key={l.providerId}>{l.providerId}: {l.rateLimit.usedPercent === undefined ? '' : `${l.rateLimit.usedPercent}% of `}{l.rateLimit.label}{l.rateLimit.remainingTokens !== undefined ? ` · ${l.rateLimit.remainingTokens} tokens left` : ''}{l.rateLimit.remainingRequests !== undefined ? ` · ${l.rateLimit.remainingRequests} requests left` : ''}{l.rateLimit.resetsAt ? ` · resets ${new Date(l.rateLimit.resetsAt).toLocaleString()}` : ''}<small> · reported {new Date(l.createdAt).toLocaleString()}</small></p>)}</div>
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
