import './chat-fixes.css';
import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { RadioGroup as Radio, Switch } from 'radix-ui';
import { Star, Zap, Check } from 'lucide-react';
import { ModelSelector } from './components/assistant-ui/elements/model-selector.aui';
import { ClaudeLogo, OpenAILogo, GeminiLogo } from "./components/assistant-ui/elements/logos";
import { desktop } from './bridge';
import { providerName, type Providers } from './providers';

function cachedDisplayNames(): Record<string,string> {
  try { return JSON.parse(localStorage.getItem('vstudy-model-display-names') ?? '{}'); } catch { return {}; }
}
export const effortLabel = (id: string) => ({ low: tr('common:low'), medium: tr('common:medium'), high: tr('common:high'), xhigh: tr('common:extra_high'), max: tr('common:max'), ultra: 'Ultra', ultracode: 'Ultracode', ultrathink: 'Ultrathink' })[id] ?? id;
export function pickerModels(providers: Providers) {
  return [...providers].sort((a,b) => Number(!a.config.enabled || !a.availability.available) - Number(!b.config.enabled || !b.availability.available)).flatMap(p => {
    const seen = new Set<string>();
    if (p.config.kind === 'api' && (!p.config.enabled || !p.availability.available)) return p.models.slice(0,1).map(m => ({...m,name:`${providerName[p.config.id]} API`,value:`${p.config.id}/${m.id}`,providerId:p.config.id,provider:providerName[p.config.id],available:false,reason:tr('picker:add_key')}));
    return [...p.models].sort((a, b) => Number(b.id === 'default') - Number(a.id === 'default') || Number(a.id === a.resolvedId) - Number(b.id === b.resolvedId)).filter(m => {
      const key = m.id === 'default' ? 'default' : m.resolvedId ?? m.id;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(m => ({ ...m, value: `${p.config.id}/${m.id}`, providerId: p.config.id, provider: providerName[p.config.id], available: p.config.enabled && p.availability.available, reason: !p.config.enabled ? tr('common:provider_disabled') : p.availability.available ? tr('common:available') : tr('errors:provider_unavailable') }));
  });
}
export function compareModels(a: {name:string}, b: {name:string}) {
  const family = (name: string) => name.toLowerCase().replace(/[\d.]+/g,'').replace(/[-\s]+/g,' ').trim();
  const versions = (name: string) => (name.match(/\d+/g) ?? []).map(Number);
  const av = versions(a.name), bv = versions(b.name);
  return family(a.name).localeCompare(family(b.name)) || Array.from({length:Math.max(av.length,bv.length)},(_,i) => (bv[i] ?? 0) - (av[i] ?? 0)).find(n => n !== 0) || a.name.localeCompare(b.name);
}
function traitKeys(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') !== 'radio') return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]'));
  const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (direction === undefined && !['Home','End','Enter',' '].includes(event.key)) return;
  // Command owns arrow/Enter navigation; keep trait keystrokes within the Radix radio group.
  event.preventDefault(); event.stopPropagation();
  const index = radios.indexOf(target as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1 : (index + (direction ?? 0) + radios.length) % radios.length;
  radios[next]?.focus(); radios[next]?.click();
}
export function ModelPicker({ providers, model, onModel, onSettings, values = {}, onChange }: { providers: Providers; model: string; onModel: (value: string) => void; onSettings: () => void; onProvidersChanged?: () => Promise<void>; values?: Record<string,string|boolean>; onChange?: (values: Record<string,string|boolean>) => void }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [displayNames, setDisplayNames] = useState<Record<string,string>>(cachedDisplayNames);
  const [favorites, setFavorites] = useState<string[]>([]), [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [boundary, setBoundary] = useState<Element | null>(null);
  useEffect(() => { setBoundary(root.current?.closest('.aui-thread-root, .chat-start') ?? root.current?.closest('.pane') ?? null); void desktop.invoke('settings:get', {}).then(s => { setDisplayNames(names => ({...names,...s.modelDisplayNames})); setFavorites(s.favoriteModels ?? []); setRecent(s.recentModels ?? []); }).catch(() => {}); }, []);
  const all = pickerModels(providers);
  const original = providers.flatMap(p => p.models.map(m => ({ ...m, value: `${p.config.id}/${m.id}`, providerId: p.config.id }))).find(m => m.value === model || (m.providerId === model.split('/')[0] && m.resolvedId === model.split('/').slice(1).join('/') && m.id !== 'default'));
  const selected = all.find(m => m.value === model) ?? all.find(m => m.providerId === original?.providerId && m.resolvedId === original?.resolvedId && m.id !== 'default');
  useEffect(() => {
    if (!selected || displayNames[model] === selected.name) return;
    const name = selected.name;
    setDisplayNames(names => { const next = {...names,[model]:name}; try { localStorage.setItem('vstudy-model-display-names',JSON.stringify(next)); } catch { /* Private renderer storage can be disabled. */ } return next; });
  }, [selected?.name, model]);
  const effort = selected?.options?.find(o => /effort/i.test(o.id));
  const speed = selected?.options?.find(o => o.id === 'fastMode' || (o.id === 'serviceTier' && o.values.some(v => v.id === 'priority')));
  const fast = speed && ['true', 'priority'].includes(String(values[speed.id] ?? speed.default));
  const entries = all.map(m => ({ id: m.value, name: m.name, description: `${!m.available && m.providerId.endsWith("api") ? "" : m.resolvedId ?? m.id}${m.available ? '' : `${m.providerId.endsWith('api') ? '' : ' · '}${m.reason}`}`, disabled: !m.available, keywords: [m.provider, m.id], icon: <span className={`availability-dot ${m.available ? 'available' : ''}`} title={m.reason} /> }));
  const canonical = (value: string) => {
    const raw = providers.flatMap(p => p.models.map(m => ({ ...m, value: `${p.config.id}/${m.id}`, providerId: p.config.id }))).find(m => m.value === value || (m.providerId === value.split('/')[0] && m.resolvedId === value.split('/').slice(1).join('/') && m.id !== 'default'));
    return all.find(m => m.value === value)?.value ?? all.find(m => m.providerId === raw?.providerId && m.resolvedId === raw?.resolvedId && m.id !== 'default')?.value ?? value;
  };
  const isFavorite = (value: string) => favorites.some(x => canonical(x) === value);
  const isRecent = (value: string) => recent.some(x => canonical(x) === value);
  const persist = async (f: string[], r: string[]) => { try { const s = await desktop.invoke('settings:get', {}); await desktop.invoke('settings:set', { ...s, favoriteModels: f, recentModels: r }); } catch { /* Selection stays usable when settings storage is unavailable. */ } };
  const choose = (value: string) => { const r = [value, ...recent.filter(x => canonical(x) !== value)].slice(0,8); setRecent(r); void persist(favorites,r).then(() => onModel(value)); };
  const groups = ['Favorites', 'Recent', ...[...new Set(all.map(m => m.provider))]];
  return <div className="model-picker" ref={root}>
    <ModelSelector.Root models={entries} value={selected?.value ?? model} onValueChange={choose} open={open} onOpenChange={setOpen}>
      <ModelSelector.Trigger aria-label={tr('common:model')} className="model-trigger" title={selected?.name}>
        <span className="provider-initial" aria-hidden>{selected?.providerId.includes("claude") || selected?.providerId.includes("anthropic") ? <ClaudeLogo className="provider-logo" /> : selected?.providerId.includes("codex") || selected?.providerId.includes("openai") ? <OpenAILogo className="provider-logo" /> : selected?.providerId === "agy-cli" ? <GeminiLogo className="provider-logo" /> : "M"}</span>
        <span className="model-trigger-name">{selected?.name ?? (displayNames[model] ?? (model ? tr('common:loading_model') : tr('common:choose_a_model')))}</span>
        {effort && <span className="model-trigger-effort">· {effortLabel(String(values[effort.id] ?? effort.default))}</span>}
        {fast && <Zap size={12} aria-label={tr('common:fast_mode_on')} />}
      </ModelSelector.Trigger>
      <ModelSelector.Content side="top" align="start" searchable filter={(value, search, keywords) => { const haystack = [value, ...(keywords ?? [])].join(" ").toLowerCase().replace(/[^a-z0-9]+/g," "); return search.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every(token => haystack.includes(token) || haystack.replace(/ /g, "").includes(token)) ? 1 : 0; }} collisionBoundary={boundary} collisionPadding={12} className="model-popover" onKeyDown={e => {
        if (e.key !== 'Tab') return;
        const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled), [tabindex="0"]')).filter(n => n.getAttribute('tabindex') !== '-1');
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
        <ModelSelector.Search aria-label={tr('common:search_models')} placeholder={tr('common:search_models_or_providers')} onKeyDown={e => { if (e.key === 'Tab' && !e.shiftKey && effort) { e.preventDefault(); e.currentTarget.closest('[cmdk-root]')?.querySelector<HTMLElement>('[role=radio][data-state=checked]')?.focus(); } }} />
        <div className="model-picker-body">
          <ModelSelector.List id="model-list" aria-label={tr('common:models')}>
            <ModelSelector.Empty>{tr('common:no_matching_models')}</ModelSelector.Empty>
            {groups.map(group => {
              const rows = all.filter(m => (isFavorite(m.value) ? 'Favorites' : isRecent(m.value) ? 'Recent' : m.provider) === group).sort((a,b) => group === 'Recent' ? recent.map(canonical).indexOf(a.value) - recent.map(canonical).indexOf(b.value) : compareModels(a,b));
              return rows.length > 0 && <ModelSelector.Group key={group} heading={group === 'Favorites' ? tr('common:favorites') : group === 'Recent' ? tr('common:recent') : group}>{rows.map(m => <div className="model-row" key={m.value}>
                <ModelSelector.Item model={entries.find(x => x.id === m.value)!} title={m.reason} />
                {m.available && <button type="button" className="model-favorite" aria-label={tr(isFavorite(m.value) ? 'picker:unfavorite_model' : 'picker:favorite_model',{model:m.name})} aria-pressed={isFavorite(m.value)} onClick={() => { const f = isFavorite(m.value) ? favorites.filter(x => canonical(x) !== m.value) : [...favorites,m.value]; setFavorites(f); void persist(f,recent); }}><Star size={14} fill={isFavorite(m.value) ? 'currentColor' : 'none'} /></button>}
              </div>)}</ModelSelector.Group>;
            })}
          </ModelSelector.List>
          {onChange && <div className="model-traits">
            {effort && <section aria-label={tr('common:effort')} onKeyDownCapture={traitKeys}><h4>{tr('common:effort')}</h4><Radio.Root value={String(values[effort.id] ?? effort.default)} onValueChange={value => onChange({ ...values, [effort.id]: value })} aria-label={tr('common:effort')} className="effort-list">{effort.values.map(v => <Radio.Item key={v.id} value={v.id} className="effort-item"><span className="effort-check">{String(values[effort.id] ?? effort.default) === v.id && <Check size={13} />}</span>{effortLabel(v.id)}{v.id === effort.default && <small>{tr('common:default_label')}</small>}</Radio.Item>)}</Radio.Root></section>}
            {speed && <section className="speed-section"><h4>{tr('common:speed')}</h4><label className="fast-mode">{tr('common:fast_mode_priority_tier')}<Switch.Root aria-label={tr('common:fast_mode_priority_tier')} checked={!!fast} onCheckedChange={checked => onChange({ ...values, [speed.id]: speed.id === 'fastMode' ? checked : checked ? 'priority' : 'default' })}><Switch.Thumb /></Switch.Root></label><p>{tr('common:faster_responses')}</p></section>}
            {selected?.options?.filter(o => !/effort/i.test(o.id) && o.id !== speed?.id).map(o => <section className="speed-section" key={o.id} onKeyDownCapture={traitKeys}><h4>{o.label}</h4><Radio.Root aria-label={o.label} value={String(values[o.id] ?? o.default)} onValueChange={value => onChange({ ...values, [o.id]: value })} className="effort-list">{o.values.map(v => <Radio.Item key={v.id} value={v.id} className="effort-item">{v.label.charAt(0).toUpperCase() + v.label.slice(1)}</Radio.Item>)}</Radio.Root></section>)}
          </div>}
        </div>
        <button type="button" className="picker-settings" onClick={() => { setOpen(false); onSettings(); }}>{tr('common:api_keys_provider_settings')}</button>
      </ModelSelector.Content>
    </ModelSelector.Root>
  </div>;
}
