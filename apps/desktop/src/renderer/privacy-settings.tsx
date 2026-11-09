import { Card, Section, SettingRow, SegmentedControl } from './components/ui';
import { useTrailingCommit } from './settings/use-trailing-commit';
import { MemorySettings } from './review/memory-settings';
import { AnalyticsSettings } from './analytics-ui';
import { CliPrivacyPreferences } from './ai-cli/preferences';

import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
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
      <Section level={3} title={tr('settings:network')}><Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
        <SettingRow label={tr('settings:network_copy')}>
          <Button size="sm" variant="secondary" onClick={() => void refresh()}>
            {tr('settings:refresh')}
          </Button>
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
      <Section level={3} title={tr('settings:converter')}><Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
        {!loaded && <Button onClick={() => void load()}>{tr('settings:retry')}</Button>}
        {offline !== undefined && <p role="status">{tr(offline ? 'settings:mode_offline' : 'settings:mode_online')}</p>}
        {modeStatus && <p role="status">{modeStatus}</p>}
        {loaded && invalidIdle && <p id={idleErrorId} role="alert">{tr('settings:idle_range')}</p>}
        <SettingRow
          label={tr('settings:idle_minutes')}
          description={tr('settings:converter_copy')}
        >
          <Input
            aria-label={tr('settings:idle_minutes')}
            type="number"
            min={1}
            max={60}
            disabled={!loaded}
            value={idle}
            aria-invalid={loaded && invalidIdle}
            aria-describedby={loaded && invalidIdle ? idleErrorId : undefined}
            onChange={e => {const value=Number(e.target.value);setIdle(e.target.value);commits.schedule('idle',()=>saveIdle(value));}}
            onBlur={() => saveIdle()}
            onKeyDown={e => {if (e.key === 'Enter' || e.key === 'Escape') {commits.flush('idle');saveIdle();}}}
          />
        </SettingRow>
        <SettingRow label={tr('settings:converterMode')}>
          <SegmentedControl aria-label={tr('settings:converterMode')}
            value={offline === undefined ? '' : offline ? 'offline' : 'online'}
            disabled={!loaded} onValueChange={value => void mode(value === 'offline')}
            options={[
              { value: 'online', label: tr('settings:enable_downloads') },
              { value: 'offline', label: tr('settings:offline') },
            ]} />
        </SettingRow>
      </Card></Section>
      <Section level={3} title={tr('settings:delete')}>
        <Card variant="flat" data-danger="true"
          className="gap-[var(--space-4)] p-[var(--space-4)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--surface))] text-[var(--danger)]">
          <p>{tr('settings:delete_copy')}</p>
          <SettingRow label={tr('settings:confirm')} htmlFor="delete-confirmation">
            <Input id="delete-confirmation" aria-label={tr('settings:confirm')}
              placeholder={tr('settings:deletePlaceholder')} value={confirmation}
              onChange={e => setConfirmation(e.target.value)} autoComplete="off" />
            <Button size="sm" variant="destructive" disabled={confirmation !== 'DELETE'}
              onClick={() => void desktop.invoke('settings:deleteAllData', { confirmation: 'DELETE' })
                .catch(e => setError(errorText(e)))}>
              {tr('settings:delete')}
            </Button>
          </SettingRow>
        </Card>
      </Section>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
