import { useEffect, useState } from 'react';
import type { DocumentOpenMethod } from '../../shared/domain';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { OpenMethodSelect } from '../document-open';
import { SettingsRow } from './layout';

export function DocumentSettings() {
  const [method, setMethod] = useState<DocumentOpenMethod>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {void desktop.invoke('settings:get', {}).then(s => setMethod(s.documentOpenMethod)).catch(() => setError(tr('errors:generic')));}, []);
  const update = async (documentOpenMethod: DocumentOpenMethod) => {
    setBusy(true);
    try {
      const latest = await desktop.invoke('settings:get', {});
      const saved = await desktop.invoke('settings:set', {...latest, documentOpenMethod});
      setMethod(saved.documentOpenMethod); setError('');
    } catch {setError(tr('errors:generic'));}
    finally {setBusy(false);}
  };
  return <><SettingsRow label={tr('library:defaultOpenMethod')} description={tr('library:originalHint')}>
    <OpenMethodSelect value={method ?? 'reader'} disabled={busy || !method} onChange={value => void update(value)}/>
  </SettingsRow>{error && <p role="alert">{error}</p>}</>;
}
