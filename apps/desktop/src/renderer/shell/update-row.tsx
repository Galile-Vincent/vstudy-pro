import { useEffect, useState } from 'react';
import { RefreshCw, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { UpdateSnapshot } from '../../shared/updates';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
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
  const label = snapshot?.waiting ? tr('updates:waiting') : snapshot?.installError ? tr('updates:install_failed') : !state || ['idle', 'unsupported'].includes(state.status) ? '' : state.status === 'available'
    ? tr('updates:available', {version:state.version}) : state.status === 'downloading'
      ? tr('updates:downloading', {percent:state.percent}) : tr(`updates:${state.status}`);
  const action = () => {
    if (snapshot?.waiting || snapshot?.installing || state?.status === 'checking' || state?.status === 'downloading') return;
    const channel = state?.status === 'ready' ? 'updates:install'
      : state?.status === 'available' ? 'updates:download' : 'updates:check';
    void desktop.invoke(channel, {}).catch(() => {});
  };
  return <>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{state?.status === 'downloading' ? tr('updates:download_progress') : label}</span>
    {label && <div className="update-row" data-testid="update-row">
      {<Button variant="ghost" onClick={action} aria-label={state?.status === 'downloading' ? tr('updates:download_progress') : label} title={label}
          aria-disabled={snapshot?.waiting || snapshot?.installing || state?.status === 'checking' || state?.status === 'downloading'}>
          <RefreshCw aria-hidden="true" /><span>{label}</span>
        </Button>}
      {snapshot?.waiting && <Button variant="link" size="sm"
        onClick={() => void desktop.invoke('updates:cancel', {})}>{tr('common:cancel')}</Button>}
      {state?.status === 'available' && <Button variant="link" size="icon-sm" aria-label={tr('updates:notes')} title={tr('updates:notes')}
        onClick={() => void desktop.invoke('updates:notes', {})}><FileText aria-hidden="true" /></Button>}
      {(state?.status === 'error' || snapshot?.installError) && <Button variant="link" size="sm" onClick={action}>
        {tr('updates:retry')}</Button>}
      {state?.status === 'downloading' && <Progress value={state.percent} aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}
        aria-label={tr('updates:download_progress')} />}
    </div>}
  </>;
}
