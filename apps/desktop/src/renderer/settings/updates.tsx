import {useEffect, useState} from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { useUpdates } from '../shell/update-row';
import { SettingsGroup, SettingsRow } from './layout';
export function UpdateSettings() {
  useTranslation();
  const snapshot = useUpdates();
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    setAnnouncement(snapshot?.result ? tr(`updates:${snapshot.result}`) : '');
    const timer = setTimeout(() => setAnnouncement(''), 5000);
    return () => clearTimeout(timer);
  }, [snapshot?.result, snapshot?.lastCheckedAt]);
  return <SettingsGroup title={tr('updates:title')}>
    <SettingsRow label={tr('updates:automatic')}
      description={snapshot?.state.status === 'unsupported' ? tr('updates:unavailable') : undefined}>
      <Switch disabled={!snapshot || ['loading', 'unsupported'].includes(snapshot.state.status)} aria-label={tr('updates:automatic')} checked={snapshot?.automatic ?? true}
        onCheckedChange={enabled => void desktop.invoke('updates:setAuto', {enabled})} />
    </SettingsRow>
    <SettingsRow label={tr('updates:version', {version:snapshot?.currentVersion ?? __APP_VERSION__})}
      description={tr('updates:last_check', {time:snapshot?.lastCheckedAt
        ? new Date(snapshot.lastCheckedAt).toLocaleString() : tr('updates:never')})}>
      <Button variant="secondary" disabled={!snapshot || snapshot.state.status === 'checking'
        || ['loading', 'unsupported'].includes(snapshot.state.status)} onClick={() => void desktop.invoke('updates:check', {})}>
        {tr('updates:check')}</Button>
    </SettingsRow>
    <p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {snapshot?.state.status === 'unsupported' && <SettingsRow label={tr('updates:unsupported')}>
      <Button variant="link" onClick={() => void desktop.invoke('shell:openExternal',
        {url:'https://vstudy.vcstudio.app/download'})}>{tr('updates:download')}</Button>
    </SettingsRow>}
  </SettingsGroup>;
}
