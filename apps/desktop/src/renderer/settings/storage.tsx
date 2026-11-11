import { Panel } from '../components/panel';
import { SettingRow } from '../components/ui';
/** Storage controls show physical usage and confirmed, main-owned maintenance actions. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { storageUsageSchema } from '../../shared/storage';
import { tr, i18n } from '../../shared/i18n';
import { desktop } from '../bridge';
import { errorText } from '../status';
import { Button } from '@astryxdesign/core';

type Usage=z.infer<typeof storageUsageSchema>;
const bytes=(value:number):string=>{
  const unit=value>=1024**3 ? 3 : value>=1024**2 ? 2 : value>=1024 ? 1 : 0;
  return tr('storage:'+['bytes','kibibytes','mebibytes','gibibytes'][unit],{value:new Intl.NumberFormat(i18n.language,{maximumFractionDigits:unit ? 1 : 0}).format(value/1024**unit)});
};

export function StorageSettings(){
  useTranslation();
  const [usage,setUsage]=useState<Usage>();
  const [busy,setBusy]=useState(false),[scheduled,setScheduled]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void desktop.invoke('storage:usage',{}).then(value=>{if(alive){setUsage(value);setScheduled(value.pendingRestore);}}).catch(e=>{if(alive)setError(errorText(e));});return()=>{alive=false;};},[]);
  const run=async(work:()=>Promise<string>)=>{
    setBusy(true);setError('');setMessage('');
    try{setMessage(await work());setUsage(await desktop.invoke('storage:usage',{}));}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  const disabled=busy || scheduled;
  return <div className="settings-stack" data-testid="storage-settings" aria-busy={busy}>
    <p className="settings-intro">{tr('storage:description')}</p>
    <Panel title={tr('storage:usage')}><div className="settings-stack settings-general-rows">
      {usage?.categories.map(category=><SettingRow key={category.id} label={tr('storage:'+category.id)}><span className="storage-bytes">{bytes(category.bytes)}</span></SettingRow>)}
      {usage && <p className="muted">{tr('storage:logical_cache',{size:bytes(usage.cacheBytes)})}</p>}
    </div></Panel>
    <Panel title={tr('storage:clear_cache')}><div className="settings-stack settings-general-rows">
      <SettingRow label={tr('storage:clear_cache')} description={tr('storage:cache_limit')}><Button size="sm" label={tr('storage:clear_cache')} variant="secondary" isDisabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:clearCache',{});return 'cancelled' in result ? '' : tr('storage:done');})} /></SettingRow>
      <SettingRow label={tr('storage:clear_converted')} description={tr('storage:clear_converted_copy')}><Button size="sm" label={tr('storage:clear_converted')} variant="secondary" isDisabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:clearConverted',{});return 'cancelled' in result ? '' : tr('storage:done');})} /></SettingRow>
    </div></Panel>
    <Panel title={tr('storage:backup')}><div className="settings-stack settings-general-rows">
      <p className="muted">{tr('storage:backup_copy')}</p>
      <SettingRow label={tr('storage:export')}><Button size="sm" label={tr('storage:export')} variant="secondary" isDisabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:export',{});return result.saved ? tr('storage:done') : '';})} /></SettingRow>
      <SettingRow label={tr('storage:restore')}><Button size="sm" label={tr('storage:restore')} variant="secondary" isDisabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:restore',{});setScheduled(result.scheduled);return result.scheduled ? tr('storage:scheduled') : '';})} /></SettingRow>
      <SettingRow label={tr('storage:integrity')}><Button size="sm" label={tr('storage:integrity')} variant="secondary" isDisabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:integrity',{});return result.ok ? tr('storage:integrity_ok') : tr('storage:integrity_issues',{count:result.issues});})} /></SettingRow>
    </div></Panel>
    {(busy || scheduled || message) && <p role="status" aria-live="polite">{busy ? tr('storage:pending') : scheduled ? tr('storage:scheduled') : message}</p>}
    {error && <p role="alert">{error}</p>}
    {scheduled && <Button size="sm" label={tr('storage:restart')} variant="primary" isDisabled={busy} onClick={()=>void desktop.invoke('storage:restart',{}).catch(e=>setError(errorText(e)))} />}
  </div>;
}
