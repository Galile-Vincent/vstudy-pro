import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { tr } from '../shared/i18n';
import type { Providers } from './provider-metadata';
import { pickerModels, effortLabel, optionLabel } from './model-catalog';
import { ModelSelector } from './components/assistant-ui/elements/model-selector.aui';
import { ClaudeLogo, OpenAILogo, GeminiLogo } from './components/assistant-ui/elements/logos';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './components/ui/select';
import { Toggle } from './components/ui/toggle';
export function ModelControls({providers, model, onModel, onProvidersChanged, values = {}, onChange}: {
 providers: Providers; model: string; onModel: (value:string)=>void; onSettings:()=>void;
 onProvidersChanged?:()=>Promise<void>; values?:Record<string,string|boolean>; onChange?:(values:Record<string,string|boolean>)=>void;
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
  <ModelSelector.Root models={entries} value={selected?.value??model} onValueChange={onModel} onOpenChange={open=>{if(open) void onProvidersChanged?.();}}>
   <ModelSelector.Trigger aria-label={tr('common:model')} variant="ghost" size="sm"/>
   <ModelSelector.Content aria-label={tr('common:model')} side="top" align="start" searchable>
    <ModelSelector.Search aria-label={tr('common:search_models')} placeholder={tr('common:search_models_or_providers')}/>
    <ModelSelector.List aria-label={tr('common:model')}>
     <ModelSelector.Empty>{tr('common:no_models_found')}</ModelSelector.Empty>
     {[...new Set(all.map(m=>m.provider))].map(group=><ModelSelector.Group key={group} heading={group}>{entries.filter(m=>all.find(a=>a.value===m.id)?.provider===group).map(m=><ModelSelector.Item key={m.id} model={m}/>)}</ModelSelector.Group>)}
    </ModelSelector.List>
   </ModelSelector.Content>
  </ModelSelector.Root>
  {effort&&<Select value={String(values[effort.id]??effort.default)} onValueChange={value=>onChange?.({...values,[effort.id]:value})}><SelectTrigger aria-label={optionLabel(effort.id,effort.label)} size="sm"><SelectValue/></SelectTrigger><SelectContent>{effort.values.map(v=><SelectItem key={v.id} value={v.id}>{effort.id==='thinking'?tr(v.id==='enabled'?'picker:enabled':'picker:disabled'):effortLabel(v.id)}</SelectItem>)}</SelectContent></Select>}
  {speed&&<Toggle size="sm" pressed={fast} aria-label={tr('common:fast')} onPressedChange={checked=>onChange?.({...values,[speed.id]:speed.id==='fastMode'?checked:checked?'priority':'default'})}><Zap size={14}/></Toggle>}
 </div>;
}
