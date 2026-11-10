import { useEffect, useState } from 'react';
import { RefreshCw, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { UpdateSnapshot } from '../../shared/updates';
import { desktop } from '../bridge';
import { Button, IconButton, ProgressBar } from '@astryxdesign/core';
import './update-row.css';
export function useUpdates() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot>();
  useEffect(() => {
    let live = true;
    const stop = desktop.onUpdateState?.(value => { if (live) setSnapshot(value); });
    void desktop.invoke('updates:state', {}).then(value => { if (live) setSnapshot(value); }).catch(() => {});
    return () => { live = false; stop?.(); };
  }, []);
  return snapshot;
}
export function UpdateRow() {
  useTranslation();
  const snapshot = useUpdates();
  const state = snapshot?.state;
  const label = snapshot?.waiting ? tr('updates:waiting') : snapshot?.installError ? tr('updates:install_failed') : !state || ['idle', 'unsupported', 'loading'].includes(state.status) ? '' : state.status === 'available'
    ? tr('updates:available', {version:state.version}) : state.status === 'downloading'
      ? tr('updates:downloading', {percent:state.percent}) : tr(`updates:${state.status}`);
  const action = () => {
    if (snapshot?.waiting || snapshot?.installing || state?.status === 'checking' || state?.status === 'downloading') return;
    const channel = state?.status === 'ready' ? 'updates:install'
      : state?.status === 'available' ? 'updates:download' : 'updates:check';
    void desktop.invoke(channel, {}).catch(() => {});
  };
  const busy = !!(snapshot?.waiting || snapshot?.installing || state?.status === 'checking' || state?.status === 'downloading');
  const name = state?.status === 'downloading' ? tr('updates:download_progress') : label;
  return <>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{name}</span>
    {label && <div className="update-row" data-testid="update-row">
      <Button variant="ghost" size="sm" label={name} tooltip={label} icon={<RefreshCw aria-hidden="true" />} isDisabled={busy} onClick={action}>
        <span>{label}</span>
      </Button>
      {snapshot?.waiting && <Button variant="ghost" size="sm" label={tr('common:cancel')}
        onClick={() => void desktop.invoke('updates:cancel', {})} />}
      {state?.status === 'available' && <IconButton variant="ghost" size="sm" label={tr('updates:notes')} tooltip={tr('updates:notes')} icon={<FileText aria-hidden="true" />}
        onClick={() => void desktop.invoke('updates:notes', {})} />}
      {(state?.status === 'error' || snapshot?.installError) && <Button variant="ghost" size="sm" label={tr('updates:retry')} onClick={action} />}
      {state?.status === 'downloading' && <ProgressBar value={state.percent} label={tr('updates:download_progress')} isLabelHidden />}
    </div>}
  </>;
}
