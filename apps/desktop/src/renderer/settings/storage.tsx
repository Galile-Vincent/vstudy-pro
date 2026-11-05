/** Storage controls show physical usage and confirmed, main-owned maintenance actions. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { storageUsageSchema } from '../../shared/storage';
import { tr, i18n } from '../../shared/i18n';
import { desktop } from '../bridge';
import { errorText } from '../status';
import { Button } from '../components/ui/button';
import { SettingsGroup, SettingsRow } from './layout';
type Usage=z.infer<typeof storageUsageSchema>;
const bytes=(value:number):string=>new Intl.NumberFormat(i18n.language,{style:'unit',unit:'byte',notation:'compact',maximumFractionDigits:1}).format(value);

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
  return <div data-testid="storage-settings" aria-busy={busy}>
    <p className="muted settings-storage-intro">{tr('storage:description')}</p>
    <SettingsGroup title={tr('storage:usage')}>
      {usage?.categories.map(category=><SettingsRow key={category.id} label={tr('storage:'+category.id)}><output className="storage-bytes">{bytes(category.bytes)}</output></SettingsRow>)}
      {usage && <p className="settings-copy muted">{tr('storage:logical_cache',{size:bytes(usage.cacheBytes)})}</p>}
    </SettingsGroup>
    <SettingsGroup>
      <SettingsRow label={tr('storage:clear_cache')} description={tr('storage:cache_limit')}><Button variant="secondary" disabled={disabled} onClick={()=>void run(async()=>{await desktop.invoke('storage:clearCache',{});return tr('storage:done');})}>{tr('storage:clear_cache')}</Button></SettingsRow>
      <SettingsRow label={tr('storage:clear_converted')} description={tr('storage:clear_converted_copy')}><Button variant="secondary" disabled={disabled} onClick={()=>void run(async()=>{await desktop.invoke('storage:clearConverted',{});return tr('storage:done');})}>{tr('storage:clear_converted')}</Button></SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={tr('storage:backup')}>
      <p className="settings-copy muted">{tr('storage:backup_copy')}</p>
      <SettingsRow label={tr('storage:export')}><Button variant="secondary" disabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:export',{});return result.saved ? tr('storage:done') : '';})}>{tr('storage:export')}</Button></SettingsRow>
      <SettingsRow label={tr('storage:restore')}><Button variant="secondary" disabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:restore',{});setScheduled(result.scheduled);return result.scheduled ? tr('storage:scheduled') : '';})}>{tr('storage:restore')}</Button></SettingsRow>
      <SettingsRow label={tr('storage:integrity')}><Button variant="secondary" disabled={disabled} onClick={()=>void run(async()=>{const result=await desktop.invoke('storage:integrity',{});return result.ok ? tr('storage:integrity_ok') : tr('storage:integrity_issues',{count:result.issues});})}>{tr('storage:integrity')}</Button></SettingsRow>
    </SettingsGroup>
    <p role="status" aria-live="polite">{busy ? tr('storage:pending') : scheduled ? tr('storage:scheduled') : message}</p>
    {error && <p role="alert">{error}</p>}
    {scheduled && <Button disabled={busy} onClick={()=>void desktop.invoke('storage:restart',{}).catch(e=>setError(errorText(e)))}>{tr('storage:restart')}</Button>}
  </div>;
}
