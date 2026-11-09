import { Card, Section, SettingRow } from '../components/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { studyMemoryActive, type StudyPrefs } from '../../shared/review';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';


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
  return <Section level={3} title={tr('review:memory_title')}><Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
    <SettingRow htmlFor="memory-enabled" label={tr('review:memory_enabled')} description={tr('review:memory_disclosure')} stack>
      {prefs && <Switch id="memory-enabled" checked={studyMemoryActive(prefs)} disabled={busy} onCheckedChange={checked => void save(checked ? {memoryEnabled:true,consentAcknowledged:true} : {memoryEnabled:false})} />}
      <Button variant="secondary" disabled={!prefs || busy} onClick={() => setConfirm(true)}>{tr('review:erase_memory')}</Button>
      {erased && <p role="status">{tr('review:erase_done')}</p>}
      {error && <div role="alert"><p>{tr('review:error')}</p><Button onClick={() => void load()}>{tr('review:retry')}</Button></div>}
      <Dialog open={confirm} onOpenChange={value => { if (!busy) setConfirm(value); }}>
        <DialogContent><DialogTitle>{tr('review:erase_confirm')}</DialogTitle><DialogDescription>{tr('review:erase_confirm_copy')}</DialogDescription><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>{tr('review:cancel')}</Button><Button variant="destructive" disabled={busy} onClick={() => void erase()}>{tr('review:erase_confirm')}</Button></DialogContent>
      </Dialog>
    </SettingRow>
  </Card></Section>;
}
