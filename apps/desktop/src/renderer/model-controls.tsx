import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { tr } from '../shared/i18n';
import type { Providers } from './provider-metadata';
import { pickerModels, effortLabel, optionLabel } from './model-catalog';
import { ModelSelector } from './components/assistant-ui/elements/model-selector.aui';
import { ClaudeLogo, OpenAILogo, GeminiLogo } from './components/assistant-ui/elements/logos';
import { Selector, ToggleButton } from '@astryxdesign/core';
import { Button } from "@astryxdesign/core";
export function ModelControls({providers, model, onModel, onSettings, onProvidersChanged, onOpenChange, values = {}, onChange}: {
 providers: Providers; model: string; onModel: (value:string)=>void; onSettings:()=>void;
 onOpenChange?:(open:boolean)=>void; onProvidersChanged?:()=>Promise<void>; values?:Record<string,string|boolean>; onChange?:(values:Record<string,string|boolean>)=>void;
}) {
 useTranslation();
 const all = pickerModels(providers);
 const original = providers.flatMap(p=>p.models.map(m=>({...m,providerId:p.config.id}))).find(m=>m.providerId===model.split('/')[0]&&(m.id===model.split('/').slice(1).join('/')||m.resolvedId===model.split('/').slice(1).join('/')));
 const selected = all.find(m=>m.value===model)??all.find(m=>m.providerId===original?.providerId&&m.resolvedId===original?.resolvedId&&m.id!=='default');
 const effort = selected?.options?.find(o=>/effort/i.test(o.id)||o.id==='thinking');
 const speed = selected?.options?.find(o=>o.id==='fastMode'||(o.id==='serviceTier'&&o.values.some(v=>v.id==='priority')));
 const fast = !!speed && ['true','priority'].includes(String(values[speed.id]??speed.default));
 const entries = all.map(m=>({id:m.value,name:m.name,description:m.available?'':m.reason,disabled:!m.available,keywords:[m.provider,m.id],icon:m.providerId.includes('claude')||m.providerId.includes('anthropic')?<ClaudeLogo/>:m.providerId==='agy-cli'?<GeminiLogo/>:<OpenAILogo/>}));
 return <div className="model-controls">
  <ModelSelector models={entries} value={selected?.value??model} onValueChange={onModel} onOpenChange={open=>{onOpenChange?.(open);if(open) void onProvidersChanged?.();}}/>
  {!all.some(m=>m.available) && <Button label={tr('novice:connect_ai')} variant="ghost" size="sm" onClick={onSettings}>{tr('novice:connect_ai')}</Button>}
  {effort && <Selector label={optionLabel(effort.id,effort.label)} isLabelHidden value={String(values[effort.id]??effort.default)} onChange={value=>onChange?.({...values,[effort.id]:value})} options={effort.values.map(v=>({value:v.id,label:effort.id==='thinking'?tr(v.id==='enabled'?'picker:enabled':'picker:disabled'):effortLabel(v.id)}))}/>}
  {speed && <ToggleButton label={tr('common:fast')} isPressed={fast} onPressedChange={checked=>onChange?.({...values,[speed.id]:speed.id==='fastMode'?checked:checked?'priority':'default'})} icon={<Zap size={14}/>} isIconOnly/>}
 </div>;
}
