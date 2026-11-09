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
    {snapshot?.result && <p role="status">{tr(`updates:${snapshot.result}`)}</p>}
    {snapshot?.state.status === 'unsupported' && <SettingsRow label={tr('updates:unsupported')}>
      <Button variant="link" onClick={() => void desktop.invoke('shell:openExternal',
        {url:'https://vstudy.vcstudio.app/download'})}>{tr('updates:download')}</Button>
    </SettingsRow>}
  </SettingsGroup>;
}
