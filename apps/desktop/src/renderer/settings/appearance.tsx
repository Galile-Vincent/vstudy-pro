import { useEffect, useState } from 'react';
import { type Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Select } from '../components/select';
import { SettingsGroup, SettingsRow } from './layout';
const accents={neutral:[0,0],blue:[.12,250],green:[.11,150],violet:[.12,300],amber:[.11,70]} as const;
export function applyAppearance(s:Settings) {
 const root=document.documentElement;
 root.style.setProperty('--ui-scale',String(s.uiScale/100));
 root.style.setProperty('--density',s.density==='compact'?'.875':'1');
 root.style.setProperty('--accent-c',String(accents[s.accent][0]));root.style.setProperty('--accent-h',String(accents[s.accent][1]));
 root.style.setProperty('--font-reader',s.readerFont==='serif'?'Georgia,"Noto Serif CJK TC",serif':s.readerFont==='mono'?'var(--font-mono)':'var(--font-ui)');
 root.style.setProperty('--reader-size',({s:'.8125rem',m:'.875rem',l:'1rem',xl:'1.125rem'})[s.readerSize]);
 root.dataset.material=s.material;root.dataset.accent=s.accent;
}
export function AppearanceSection() {
 const [settings,setSettings]=useState<Settings>();const [error,setError]=useState('');
 useEffect(()=>{void desktop.invoke('settings:get',{}).then(setSettings).catch(()=>setError(tr('errors:generic')));},[]);
 const update=async(field:keyof Settings,value:unknown)=>{try {const latest=await desktop.invoke('settings:get',{});const next=await desktop.invoke('settings:set',{...latest,[field]:value});applyAppearance(next);setSettings(next);setError('');}catch{setError(tr('errors:generic'));}};
 const toggles=(field:'uiScale'|'density'|'readerSize'|'material',values:readonly (string|number)[])=><ToggleGroup type="single" size="sm" aria-label={tr(`settings:${field}`)} value={String(settings?.[field]??'')} onValueChange={value=>{if(value)void update(field,field==='uiScale'?Number(value):value);}}>{values.map(v=><ToggleGroupItem key={v} value={String(v)} aria-label={field==='uiScale'?`${v}%`:tr(`settings:${v}`)}>{field==='uiScale'?`${v}%`:tr(`settings:${v}`)}</ToggleGroupItem>)}</ToggleGroup>;
 return <div className="appearance-layout"><div className="appearance-preview settings-card" role="img" aria-label={tr('settings:preview')} aria-hidden="true"><h3>{tr('settings:sampleTitle')}</h3><p className="preview-reader">{tr('settings:sampleReader')}<br/>{tr('settings:sampleCjk')}</p><p className="preview-chat">{tr('settings:sampleChat')}</p><span className="preview-button">{tr('settings:preview')}</span><div className="preview-selected">{tr('settings:sampleTitle')}</div></div><SettingsGroup>{(['uiScale','density','accent','readerFont','readerSize','material'] as const).map(field=><SettingsRow key={field} label={tr(`settings:${field}`)}>{field==='accent'?<div role="radiogroup" aria-label={tr('settings:accent')} className="accent-swatches">{Object.entries(accents).map(([name,[c,h]])=><button key={name} type="button" role="radio" aria-checked={settings?.accent===name} aria-label={tr(`settings:${name}`)} style={{background:`oklch(.55 ${c} ${h})`}} onClick={()=>void update(field,name)}/>)}</div>:field==='readerFont'?<Select aria-label={tr('settings:readerFont')} value={settings?.readerFont??'system'} onChange={e=>void update(field,e.target.value)}>{['system','serif','mono'].map(v=><option key={v} value={v}>{tr(`settings:${v}`)}</option>)}</Select>:field==='uiScale'?toggles(field,[100,125,150,200]):field==='density'?toggles(field,['comfortable','compact']):field==='readerSize'?toggles(field,['s','m','l','xl']):toggles(field,['glass','solid'])}</SettingsRow>)}</SettingsGroup>{error&&<p role="alert">{error}</p>}</div>;
}
