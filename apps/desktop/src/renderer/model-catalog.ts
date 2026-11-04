import { tr } from '../shared/i18n';
import { providerName, type Providers } from './provider-metadata';
export const effortLabel = (id: string) => ({ low: tr('common:low'), medium: tr('common:medium'), high: tr('common:high'), xhigh: tr('common:extra_high'), max: tr('common:max'), ultra: 'Ultra', ultracode: 'Ultracode', ultrathink: 'Ultrathink' })[id] ?? id;
export function pickerModels(providers: Providers) {
  return [...providers].sort((a,b) => Number(!a.config.enabled || !a.availability.available) - Number(!b.config.enabled || !b.availability.available)).flatMap(p => {
    const seen = new Set<string>();
    if (p.config.kind === 'api' && (!p.config.enabled || !p.availability.available)) return p.models.slice(0,1).map(m => ({...m,name:`${providerName[p.config.id]} API`,value:`${p.config.id}/${m.id}`,providerId:p.config.id,provider:providerName[p.config.id],available:false,reason:tr('picker:add_key')}));
    return [...p.models].filter(m=>!('hidden' in m && m.hidden)).sort((a, b) => Number(b.id === 'default') - Number(a.id === 'default') || Number(a.id === a.resolvedId) - Number(b.id === b.resolvedId)).filter(m => {
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

export const optionLabel = (id:string, fallback:string) => ({reasoningEffort:tr('common:effort'),thinking:tr('picker:thinking'),fastMode:tr('common:fast'),serviceTier:tr('common:fast')})[id]??fallback;
