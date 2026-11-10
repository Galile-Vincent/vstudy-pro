import { Card, Button, Dialog, Switch } from '@astryxdesign/core';
import { Section } from '../components/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { studyMemoryActive, type StudyPrefs } from '../../shared/review';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { SettingRow } from '../components/ui/setting-row';

export function MemorySettings() {
  useTranslation();
  const [prefs, setPrefs] = useState<StudyPrefs>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [erased, setErased] = useState(false);
  async function load() {
    setError(false);
    try { setPrefs(await desktop.invoke('review:prefs:get', {})); }
    catch { setError(true); }
  }
  useEffect(() => { void load(); }, []);
  async function save(changes: Partial<StudyPrefs>) {
    setBusy(true); setError(false);
    try { setPrefs(await desktop.invoke('review:prefs:set', changes)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  async function erase() {
    setBusy(true); setError(false);
    try {
      await desktop.invoke('review:prefs:erase', {});
      setConfirm(false); setErased(true);
      await load();
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return (
    <Section level={3} title={tr('review:memory_title')}>
      <Card className="gap-[var(--space-4)] p-[var(--space-4)]">
        <SettingRow htmlFor="memory-enabled" label={tr('review:memory_enabled')} description={tr('review:memory_disclosure')} stack>
          {prefs && (
            <Switch
              htmlName="memory-enabled"
              label={tr('review:memory_enabled')}
              isLabelHidden
              value={studyMemoryActive(prefs)}
              isDisabled={busy}
              onChange={checked => void save(checked ? { memoryEnabled: true, consentAcknowledged: true } : { memoryEnabled: false })}
            />
          )}
          <Button
            variant="secondary"
            isDisabled={!prefs || busy}
            label={tr('review:erase_memory')}
            onClick={() => setConfirm(true)}
          />
          {erased && <p role="status">{tr('review:erase_done')}</p>}
          {error && (
            <div role="alert">
              <p>{tr('review:error')}</p>
              <Button label={tr('review:retry')} onClick={() => void load()} />
            </div>
          )}
          <Dialog
            isOpen={confirm}
            aria-label={tr('review:erase_confirm')}
            onOpenChange={value => { if (!busy) setConfirm(value); }}
          >
            <div className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)]">
              <h2>{tr('review:erase_confirm')}</h2>
              <p>{tr('review:erase_confirm_copy')}</p>
              <div className="flex gap-[var(--space-2)] justify-end">
                <Button variant="secondary" isDisabled={busy} label={tr('review:cancel')} onClick={() => setConfirm(false)} />
                <Button variant="destructive" isDisabled={busy} label={tr('review:erase_confirm')} onClick={() => void erase()} />
              </div>
            </div>
          </Dialog>
        </SettingRow>
      </Card>
    </Section>
  );
}
