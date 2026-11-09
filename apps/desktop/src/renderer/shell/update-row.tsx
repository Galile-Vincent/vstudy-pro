import { useEffect, useState } from 'react';
import { Download, RefreshCw, FileText } from 'lucide-react';
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
export function UpdateRow({ collapsed = false }: { collapsed?: boolean }) {
  useTranslation();
  const snapshot = useUpdates();
  const state = snapshot?.state;
  const label = !state || state.status === 'idle' ? '' : state.status === 'available'
    ? tr('updates:available', {version:state.version}) : state.status === 'downloading'
      ? tr('updates:downloading', {percent:state.percent}) : tr(`updates:${state.status}`);
  const action = () => {
    if (snapshot?.installing) return;
    const channel = state?.status === 'ready' ? 'updates:install'
      : state?.status === 'available' ? 'updates:download' : 'updates:check';
    void desktop.invoke(channel, {}).catch(() => {});
  };
  return <>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{label}</span>
    {label && <div className="update-row" data-collapsed={collapsed} data-testid="update-row">
      {state?.status === 'unsupported'
        ? <Button variant="ghost" aria-label={label} title={label}
          onClick={() => void desktop.invoke('shell:openExternal', {url:'https://vstudy.vcstudio.app/download'})}>
          <Download aria-hidden="true" /><span>{label}</span>
        </Button>
        : <Button variant="ghost" onClick={action} aria-label={label} title={label}
          disabled={snapshot?.installing || state?.status === 'checking' || state?.status === 'downloading'}>
          <RefreshCw aria-hidden="true" /><span>{label}</span>
        </Button>}
      {state?.status === 'available' && !collapsed && <Button variant="link" size="icon-sm" aria-label={tr('updates:notes')} title={tr('updates:notes')}
        onClick={() => void desktop.invoke('updates:notes', {})}><FileText aria-hidden="true" /></Button>}
      {state?.status === 'error' && !collapsed && <Button variant="link" size="sm" onClick={action}>
        {tr('updates:retry')}</Button>}
      {state?.status === 'downloading' && <Progress value={state.percent} aria-label={label} />}
    </div>}
  </>;
}
