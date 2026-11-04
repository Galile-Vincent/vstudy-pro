import { SettingsGroup, SettingsRow } from './settings/layout';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import type { IpcResponse } from '../shared';
import { desktop } from './bridge';
import { errorText } from './status';
export function PrivacySettings() {
  useTranslation();
  const [events,setEvents] = useState<IpcResponse<'settings:networkActivity'>>([]);
  const [idle,setIdle] = useState(5);
  const [confirmation,setConfirmation] = useState('');
  const [error,setError] = useState('');
  const refresh = () => desktop.invoke('settings:networkActivity',{}).then(setEvents).catch(e => setError(errorText(e)));
  useEffect(() => { void refresh(); void desktop.invoke('settings:get',{}).then(s => setIdle(s.converterIdleMinutes)); },[]);
  const mode = (offline:boolean) => desktop.invoke('converter:mode',{offline}).then(refresh).catch(e => setError(errorText(e)));
  return <div data-testid="privacy-settings">
    <SettingsGroup title={tr('settings:network')}><SettingsRow label={tr('settings:network_copy')}><Button size="sm" variant="ghost" onClick={()=>void refresh()}>{tr('settings:refresh')}</Button></SettingsRow>{events.length?events.map((event,index)=><div className="network-event" key={index}><time dateTime={event.at}>{new Date(event.at).toLocaleString(document.documentElement.lang)}</time><span>{tr(`settings:event_${event.what}`)} — {event.to}</span></div>):<div className="network-event">{tr('settings:empty_network')}</div>}</SettingsGroup>
    <SettingsGroup title={tr('settings:converter')}><SettingsRow label={tr('settings:idle_minutes')} description={tr('settings:converter_copy')}><Input aria-label={tr('settings:idle_minutes')} type="number" min={1} max={60} value={idle} onChange={e=>{const value=Number(e.target.value);setIdle(value);if(Number.isInteger(value)&&value>=1&&value<=60)void desktop.invoke('settings:get',{}).then(s=>desktop.invoke('settings:set',{...s,converterIdleMinutes:value})).catch(e=>setError(errorText(e)));}}/></SettingsRow><SettingsRow label={tr('settings:converterMode')}><Button size="sm" variant="secondary" onClick={()=>void mode(false)}>{tr('settings:retry')}</Button><Button size="sm" variant="secondary" onClick={()=>void mode(true)}>{tr('settings:offline')}</Button></SettingsRow></SettingsGroup>
    <SettingsGroup title={tr('settings:delete')} danger><SettingsRow label={tr('settings:delete')} description={tr('settings:delete_copy')}><Input aria-label={tr('settings:confirm')} placeholder={tr('settings:deletePlaceholder')} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/><Button size="sm" variant="ghost" className="settings-danger" disabled={confirmation!=='DELETE'} onClick={()=>void desktop.invoke('settings:deleteAllData',{confirmation:'DELETE'}).catch(e=>setError(errorText(e)))}>{tr('settings:delete')}</Button></SettingsRow></SettingsGroup>
    {error && <p role="alert">{error}</p>}
  </div>;
}
