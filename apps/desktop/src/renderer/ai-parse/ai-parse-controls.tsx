import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { Document } from '../../shared/domain';
import { Button } from "@astryxdesign/core";
import { Popover } from '@astryxdesign/core';
import { ModelControls } from '../model-controls';
import { pickerModels } from '../model-catalog';
import type { Providers } from '../provider-metadata';
import { useAiParse } from './use-ai-parse';
import { AiParsePanel } from './ai-parse-panel';
import './ai-parse.css';

export function AiParseControls({ document, providers, pageCount, initiallyOpen, onReload, onSettings, onProvidersChanged }: {
 document: Document; providers: Providers; pageCount: number; initiallyOpen: boolean;
 onReload: (version: 'original'|'ai') => Promise<void>; onSettings: () => void; onProvidersChanged: () => Promise<void>;
}) {
 useTranslation();
 const ai = useAiParse(document.id,document.status==='ready');
 const [open, setOpen] = useState(initiallyOpen);
 const [model, setModel] = useState('');
 const [scope, setScope] = useState<'all'|'range'|'preview'>('all');
 const [start, setStart] = useState(1), [end, setEnd] = useState(Math.max(1,pageCount));
 const [discovering,setDiscovering] = useState(false);
 const [discoveryError,setDiscoveryError] = useState(false);
 const refreshModels = useCallback(async()=>{
  setDiscovering(true);setDiscoveryError(false);
  try {await onProvidersChanged();} catch {setDiscoveryError(true);}
  finally {setDiscovering(false);}
 },[onProvidersChanged]);
 useEffect(()=>{if(open && document.status==='ready')void refreshModels();},[open,document.status,refreshModels]);
 const [options, setOptions] = useState<Record<string,string|boolean>>({});
 const [pending,setPending] = useState(false);
 const models = pickerModels(providers.filter(p=>p.config.id!=='agy-cli'));
 const selected = models.find(m=>m.value===(model || (ai.state?.providerId && ai.state.modelId ? `${ai.state.providerId}/${ai.state.modelId}` : models.find(m=>m.available)?.value)));
 const busy = ai.state?.status === 'running';
 const previousStatus = useRef(ai.state?.status);
 const reload = useRef(onReload);
 reload.current = onReload;
 useEffect(()=>{
  if(previousStatus.current==='running' && ai.state && ai.state.status!=='running') void reload.current(ai.state.activeVersion);
  previousStatus.current=ai.state?.status;
 },[ai.state?.status]);
 const request = selected ? {providerId:selected.providerId, modelId:selected.id, scope, startPage:start, endPage:end,
  options:{concurrency:2,confirmBudgetOverride:false,modelOptions:options}} : undefined;
 const invalidate = () => ai.clearEstimate();
 const useVersion = async (version:'original'|'ai') => {
  setPending(true);
  try { if(await ai.use(version)) { await onReload(version); setOpen(false); } }
  finally { setPending(false); }
 };
 const hasAi = ai.state && !ai.state.code && ai.state.pages.some(page=>page.status==='done') && ai.state.status !== 'running';
 return <div className="ai-parse-controls">
  <Popover isOpen={open} onOpenChange={setOpen} alignment="end" label={tr('library:ai_parse.title')} content={<div className="ai-parse-popover">
    {document.status!=='ready' ? <p role="status">{tr('library:ai_parse.not_ready')}</p> : <>
     <p className="text-muted-foreground">{tr('library:ai_parse.cli_hint')}</p>
     <Button label={tr('common:open_settings')} variant="secondary" onClick={()=>{setOpen(false);onSettings();}}>{tr('common:open_settings')}</Button>
     {discovering && <p role="status">{tr('common:loading_model')}</p>}
     {discoveryError && <p role="alert">{tr('errors:provider_unavailable')}</p>}
     {ai.error && <p role="alert">{tr(ai.error)}</p>}
     {ai.state && <AiParsePanel state={ai.state} estimate={ai.estimate} pageCount={pageCount} disabled={!selected?.available || pending} modelPicker={<fieldset disabled={busy} className="min-w-0"><ModelControls providers={providers.filter(p=>p.config.id!=='agy-cli')} model={selected?.value??''} onModel={value=>{setModel(value);setOptions({});invalidate();}} onSettings={onSettings} onProvidersChanged={refreshModels} values={options} onChange={value=>{setOptions(value);invalidate();}}/></fieldset>}
      scope={scope} startPage={start} endPage={end} onScope={value=>{setScope(value);invalidate();}} onRange={(a,b)=>{setStart(a);setEnd(b);invalidate();}}
      onEstimate={()=>{if(request)void ai.estimateCost(request);}} onStart={()=>{if(request)void ai.start(request);}} onCancel={()=>void ai.cancel()}
      onUse={version=>void useVersion(version)} onDiscard={()=>void ai.discard().then(ok=>{if(ok)void onReload('original');})} t={tr}/>}</>}
   </div>}>
    <Button label={tr('library:ai_parse.title')} variant="secondary" size="sm" icon={<Sparkles aria-hidden="true"/>}>{tr('library:ai_parse.title')}</Button>
  </Popover>
  {hasAi && <div role="group" aria-label={tr('library:ai_parse.version')} className="flex flex-wrap gap-1">{(['original','ai'] as const).map(version=><Button label={tr('library:ai_parse.'+version)} key={version} size="sm" variant={ai.state?.activeVersion===version?'secondary':'ghost'} aria-pressed={ai.state?.activeVersion===version} isDisabled={pending || busy} onClick={()=>void useVersion(version)}>{tr('library:ai_parse.'+version)}</Button>)}</div>}
 </div>;
}
