import { useEffect, useRef, useState } from 'react';
import { desktop } from './bridge';
import { providerName, type Providers } from './providers';
export function ModelPicker({ providers, model, onModel, onSettings }: { providers: Providers; model: string; onModel: (value: string) => void; onSettings: () => void; onProvidersChanged?: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]), [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { void desktop.invoke('settings:get', {}).then(s => { setFavorites(s.favoriteModels ?? []); setRecent(s.recentModels ?? []); }).catch(() => {}); }, []);
  useEffect(() => { const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, []);
  const all = providers.flatMap(p => p.models.map(m => ({ ...m, value: `${p.config.id}/${m.id}`, provider: providerName[p.config.id], available: p.config.enabled && p.availability.available, status: p.availability.available ? 'Available' : p.availability.reason })));
  const rows = all.filter(m => `${m.name} ${m.id} ${m.provider}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (favorites.includes(b.value) ? 2 : recent.includes(b.value) ? 1 : 0) - (favorites.includes(a.value) ? 2 : recent.includes(a.value) ? 1 : 0));
  const enabled = rows.filter(m => m.available);
  useEffect(() => { const row = root.current?.querySelector('[aria-activedescendant]')?.getAttribute('aria-activedescendant'); if (row) document.getElementById(row)?.scrollIntoView?.({ block: 'nearest' }); }, [active, search]);
  const persist = async (nextFavorites: string[], nextRecent: string[]) => { try { const s = await desktop.invoke('settings:get', {}); await desktop.invoke('settings:set', { ...s, favoriteModels: nextFavorites, recentModels: nextRecent }); } catch { /* Picker remains usable if settings cannot be saved. */ } };
  const choose = (value: string) => { const next = [value, ...recent.filter(x => x !== value)].slice(0,8); setRecent(next); void persist(favorites,next).then(() => onModel(value)); setOpen(false); };
  return <div className="model-picker" ref={root}>
    <button type="button" aria-label="Model" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setSearch(''); setActive(0); }}>{all.find(m => m.value === model)?.name ?? (model.split('/').slice(1).join('/') || 'Choose a model')} <span aria-hidden>⌄</span></button>
    {open && <div className="model-popover">
      <input autoFocus role="combobox" aria-label="Search models" aria-expanded="true" aria-controls="model-list" aria-activedescendant={enabled[active] ? `model-${all.findIndex(m => m.value === enabled[active]?.value)}` : undefined} placeholder="Search models or providers…" value={search} onChange={e => { setSearch(e.target.value); setActive(0); }} onKeyDown={e => {
        if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, Math.min(enabled.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
        if (e.key === 'Enter') { e.preventDefault(); if (enabled[active]) choose(enabled[active].value); }
      }} />
      <div id="model-list" role="listbox" aria-label="Models">
        {!rows.length && <p className="muted">No matching models</p>}
        {rows.map((m,i) => { const group = favorites.includes(m.value) ? 'Favorites' : recent.includes(m.value) ? 'Recent' : m.provider; const prev = rows[i-1]; const prevGroup = prev && (favorites.includes(prev.value) ? 'Favorites' : recent.includes(prev.value) ? 'Recent' : prev.provider); return <div key={m.value}>
          {group !== prevGroup && <div className="model-group">{group}</div>}
          <div className={`model-row ${enabled[active]?.value === m.value ? 'active' : ''}`}>
            <button type="button" id={`model-${all.findIndex(x => x.value === m.value)}`} role="option" aria-selected={m.value === model} disabled={!m.available} onClick={() => choose(m.value)}><span>{m.name} {m.value === model && <small>Current</small>}</span><small>{m.provider} · {m.status}</small></button>
            <button type="button" aria-label={`${favorites.includes(m.value) ? 'Unfavorite' : 'Favorite'} ${m.name}`} aria-pressed={favorites.includes(m.value)} onClick={() => { const next = favorites.includes(m.value) ? favorites.filter(x => x !== m.value) : [...favorites,m.value]; setFavorites(next); void persist(next,recent); }}>{favorites.includes(m.value) ? '★' : '☆'}</button>
          </div></div>; })}
      </div>
      <button type="button" className="text-button" onClick={onSettings}>API keys & provider settings</button>
    </div>}
  </div>;
}
export function ModelOptions({ providers, model, values, onChange }: { providers: Providers; model: string; values: Record<string,string|boolean>; onChange: (values: Record<string,string|boolean>) => void }) {
  const selected = providers.flatMap(p => p.models.map(m => ({ ...m, value: `${p.config.id}/${m.id}` }))).find(m => m.value === model);
  return <div className="model-options">{selected?.options?.map(option => /effort/i.test(option.id)
    ? <fieldset key={option.id} className="effort-control" aria-label={option.label}><legend>{option.label}</legend><div role="radiogroup" aria-label={option.label}>{option.values.map(v => <button type="button" role="radio" aria-checked={String(values[option.id] ?? option.default) === v.id} key={v.id} onClick={() => onChange({ ...values, [option.id]: v.id })}>{v.label}</button>)}</div></fieldset>
    : <label key={option.id}>{option.label}<select aria-label={option.label} value={String(values[option.id] ?? option.default)} onChange={e => onChange({ ...values, [option.id]: e.target.value })}>{option.values.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>)}</div>;
}
