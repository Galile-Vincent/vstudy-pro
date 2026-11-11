import {useEffect, useState} from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button, Switch } from '@astryxdesign/core';
import { useUpdates } from '../shell/update-row';
import { Panel } from '../components/panel';
import { SettingRow } from '../components/ui';
export function UpdateSettings() {
  useTranslation();
  const snapshot = useUpdates();
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    setAnnouncement(snapshot?.result ? tr(`updates:${snapshot.result}`) : '');
    const timer = setTimeout(() => setAnnouncement(''), 5000);
    return () => clearTimeout(timer);
  }, [snapshot?.result, snapshot?.lastCheckedAt]);
  return <Panel title={tr('updates:title')}><div className="settings-stack settings-general-rows">
    <SettingRow label={tr('updates:automatic')}
      description={snapshot?.state.status === 'unsupported' ? tr('updates:unavailable') : undefined}>
      <Switch isDisabled={!snapshot || ['loading', 'unsupported'].includes(snapshot.state.status)} label={tr('updates:automatic')} isLabelHidden value={snapshot?.automatic ?? true}
        onChange={enabled => void desktop.invoke('updates:setAuto', {enabled})} />
    </SettingRow>
    <SettingRow label={tr('updates:version', {version:snapshot?.currentVersion ?? __APP_VERSION__})}
      description={tr('updates:last_check', {time:snapshot?.lastCheckedAt
        ? new Date(snapshot.lastCheckedAt).toLocaleString() : tr('updates:never')})}>
      <Button size="sm" label={tr('updates:check')} variant="secondary" isDisabled={!snapshot || snapshot.state.status === 'checking'
        || ['loading', 'unsupported'].includes(snapshot.state.status)} onClick={() => void desktop.invoke('updates:check', {})} />
    </SettingRow>
    <p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {snapshot?.state.status === 'unsupported' && <SettingRow label={tr('updates:unsupported')}>
      <Button label={tr('updates:download')} variant="ghost" onClick={() => void desktop.invoke('shell:openExternal',
        {url:'https://vstudy.vcstudio.app/download'})} />
    </SettingRow>}
  </div></Panel>;
}
