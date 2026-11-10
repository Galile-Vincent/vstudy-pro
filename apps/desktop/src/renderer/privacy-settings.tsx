import { Section, SettingRow, SegmentedControl, SegmentedControlItem } from './components/ui';
import { useTrailingCommit } from './settings/use-trailing-commit';
import { MemorySettings } from './review/memory-settings';
import { AnalyticsSettings } from './analytics-ui';
import { CliPrivacyPreferences } from './ai-cli/preferences';

import { Button, Card, TextInput } from '@astryxdesign/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from './i18n';
import { i18n, tr } from '../shared/i18n';
import type { IpcResponse } from '../shared';
import { desktop } from './bridge';
import { errorText } from './status';

export function PrivacySettings() {
  useTranslation();
  const commits = useTrailingCommit();
  const fmt = useFormat();
  const [events, setEvents] = useState<IpcResponse<'settings:networkActivity'>>([]);
  const idleErrorId = useId();
  const idleWrites = useRef(Promise.resolve());
  const savedIdle = useRef<number | undefined>(undefined);
  const [idle, setIdle] = useState<number | string>('');
  const [offline, setOffline] = useState<boolean>();
  const [modeStatus, setModeStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const load = () => desktop.invoke('settings:get', {}).then(s => { setIdle(s.converterIdleMinutes); savedIdle.current=s.converterIdleMinutes; setOffline(s.converterOffline); setLoaded(true); setError(''); }).catch(() => setError(tr('settings:load_failed')));
  const [confirmation, setConfirmation] = useState('');
  const refresh = () =>
    desktop
      .invoke('settings:networkActivity', {})
      .then(setEvents)
      .catch((e) => setError(errorText(e)));

  useEffect(() => {
    void refresh();
    void load();
  }, []);

  const mode = (offline: boolean) =>
    desktop
      .invoke('converter:mode', { offline })
      .then(() => { setOffline(offline); setModeStatus(tr('settings:mode_saved')); return refresh(); })
      .catch((e) => setError(errorText(e)));

  const invalidIdle = !Number.isInteger(Number(idle)) || Number(idle) < 1 || Number(idle) > 60;
  const saveIdle = (value = Number(idle)) => {
    if (!loaded || !Number.isInteger(value) || value < 1 || value > 60 || savedIdle.current === value) return;
    savedIdle.current = value;
    idleWrites.current = idleWrites.current.then(async () => {
      const latest = await desktop.invoke('settings:get',{});
      await desktop.invoke('settings:set',{...latest,converterIdleMinutes:value});
    }).catch(error => {savedIdle.current=undefined;setError(errorText(error));});
  };
  return (
    <div data-testid="privacy-settings">
      <AnalyticsSettings/>
      <Section level={3} title={tr('settings:network')}><Card padding={4} className="settings-stack">
        <SettingRow label={tr('settings:network_copy')}>
          <Button label={tr('settings:refresh')} variant="secondary" size="sm" onClick={() => void refresh()} />
        </SettingRow>
        {events.length ? (
          events.map((event,index) => (
            <div className="network-event" key={`${index}-${event.at}`}>
              <time dateTime={event.at}>
                {fmt.date(event.at,{dateStyle:'medium',timeStyle:'short'})}
              </time>
              <span>
                {tr(i18n.exists(`settings:event_${event.what}`) ? `settings:event_${event.what}` : 'settings:event_unknown')} · {event.to}
              </span>
            </div>
          ))
        ) : (
          <div className="network-event empty">{tr('settings:empty_network')}</div>
        )}
      </Card></Section>
      <CliPrivacyPreferences />
      <MemorySettings />
      <Section level={3} title={tr('settings:converter')}><Card padding={4} className="settings-stack">
        {!loaded && <Button label={tr('settings:retry')} variant="primary" onClick={() => void load()} />}
        {offline !== undefined && <p role="status">{tr(offline ? 'settings:mode_offline' : 'settings:mode_online')}</p>}
        {modeStatus && <p role="status">{modeStatus}</p>}
        {loaded && invalidIdle && <p id={idleErrorId} role="alert">{tr('settings:idle_range')}</p>}
        <SettingRow
          label={tr('settings:idle_minutes')}
          description={tr('settings:converter_copy')}
        >
          <TextInput
            label={tr('settings:idle_minutes')}
            isLabelHidden
            inputMode="numeric"
            width={96}
            isDisabled={!loaded}
            value={String(idle)}
            {...(loaded && invalidIdle ? { status: { type: 'error' as const }, 'aria-describedby': idleErrorId } : {})}
            onChange={(value) => {setIdle(value);commits.schedule('idle',()=>saveIdle(Number(value)));}}
            onBlur={() => saveIdle()}
            onKeyDown={e => {if (e.key === 'Enter' || e.key === 'Escape') {commits.flush('idle');saveIdle();}}}
          />
        </SettingRow>
        <SettingRow label={tr('settings:converterMode')}>
          <SegmentedControl type="single" aria-label={tr('settings:converterMode')}
            value={offline === undefined ? '' : offline ? 'offline' : 'online'}
            disabled={!loaded} onValueChange={value => { if (value) void mode(value === 'offline'); }}
          >
            <SegmentedControlItem value="online">{tr('settings:enable_downloads')}</SegmentedControlItem>
            <SegmentedControlItem value="offline">{tr('settings:offline')}</SegmentedControlItem>
          </SegmentedControl>
        </SettingRow>
      </Card></Section>
      <Section level={3} title={tr('settings:delete')}>
        <Card padding={4} data-danger="true" className="settings-stack">
          <p>{tr('settings:delete_copy')}</p>
          <SettingRow label={tr('settings:confirm')}>
            <TextInput label={tr('settings:confirm')} isLabelHidden width={192}
              placeholder={tr('settings:deletePlaceholder')} value={confirmation}
              onChange={setConfirmation} autoComplete="off" />
            <Button label={tr('settings:delete')} variant="destructive" size="sm" isDisabled={confirmation !== 'DELETE'} onClick={() => void desktop.invoke('settings:deleteAllData', { confirmation: 'DELETE' })
                .catch(e => setError(errorText(e)))} />
          </SettingRow>
        </Card>
      </Section>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
