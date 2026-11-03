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
    <section><h3>{tr('settings:network')}</h3><p>{tr('settings:network_copy')}</p><button onClick={() => void refresh()}>{tr('settings:refresh')}</button>
      {events.length ? <ul>{events.map((event,index) => <li key={index}><time dateTime={event.at}>{new Date(event.at).toLocaleString(document.documentElement.lang)}</time> — {tr(`settings:event_${event.what}`)} — {event.to}</li>)}</ul> : <p>{tr('settings:empty_network')}</p>}
    </section>
    <section><h3>{tr('settings:converter')}</h3><p>{tr('settings:converter_copy')}</p><label>{tr('settings:idle_minutes')}<input type="number" min={1} max={60} value={idle} onChange={e => { const value=Number(e.target.value); setIdle(value); if (Number.isInteger(value) && value >= 1 && value <= 60) void desktop.invoke('settings:get',{}).then(s => desktop.invoke('settings:set',{...s,converterIdleMinutes:value})).catch(e => setError(errorText(e))); }} /></label><button onClick={() => void mode(false)}>{tr('settings:retry')}</button><button onClick={() => void mode(true)}>{tr('settings:offline')}</button></section>
    <section><h3>{tr('settings:delete')}</h3><p>{tr('settings:delete_copy')}</p><label>{tr('settings:confirm')}<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button disabled={confirmation !== 'DELETE'} onClick={() => void desktop.invoke('settings:deleteAllData',{}).catch(e => setError(errorText(e)))}>{tr('settings:delete')}</button></section>
    {error && <p role="alert">{error}</p>}
  </div>;
}
