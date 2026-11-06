/** Client setup requires a separate preview and explicit install action before changing any file. */
import { useEffect, useRef, useState } from 'react';
import type { IpcResponse } from '../../shared/ipc';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';

type Client = IpcResponse<'mcp:clients'>[number];
type Setup = { step: 'choose' } | { step: 'preview' | 'installed'; client: Client; diff: string; changed: boolean };
type Busy = 'clients' | 'preview' | 'install' | 'doctor' | 'copy' | null;

export function AgentConnect({ onClose }: { onClose: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [setup, setSetup] = useState<Setup>({ step: 'choose' });
  const [busy, setBusy] = useState<Busy>('clients');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [doctor, setDoctor] = useState<IpcResponse<'mcp:doctor'> | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>, errorKey: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind); setError(''); setMessage('');
    try { await work(); }
    catch { if (alive.current) setError(errorKey); }
    finally { lock.current = false; if (alive.current) setBusy(null); }
  };
  const load = () => run('clients', async () => {
    const value = await desktop.invoke('mcp:clients', {});
    if (alive.current) setClients(value);
  }, 'clients_error');
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);

  const preview = (client: Client) => run('preview', async () => {
    const value = await desktop.invoke('mcp:install', { client: client.client, dryRun: true });
    if (alive.current) setSetup({ step: 'preview', client, ...value });
  }, 'install_error');
  const install = () => {
    if (setup.step !== 'preview') return;
    const current = setup;
    void run('install', async () => {
      setSetup({ step: 'choose' });
      const value = await desktop.invoke('mcp:install', { client: current.client.client, dryRun: false });
      if (alive.current) setSetup({ step: 'installed', client: current.client, ...value });
    }, 'install_error');
  };

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="agents-dialog" showCloseButton={false} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>{tr('agents:connect')}</DialogTitle>
      <DialogDescription>{tr('agents:connect_help')}</DialogDescription>
      {setup.step === 'choose' ? <div className="agents-client-list">
        {clients.map(client => <article className="agents-card" key={client.client}>
          <header className="agents-card-header"><h3>{tr(`agents:client_${client.client}`)}</h3><span className="agents-muted">{tr(`agents:${client.detected ? 'detected' : 'not_detected'}`)}</span></header>
          <p className="agents-muted">{tr('agents:config_path')}</p><code className="agents-raw">{client.configPath}</code>
          <pre className="agents-raw">{client.command}</pre>
          <div className="agents-actions">
            <Button variant="secondary" disabled={!!busy} onClick={() => void run('copy', async () => { await navigator.clipboard.writeText(client.command); if (alive.current) setMessage('copied'); }, 'copy_error')}>{tr('agents:copy')}</Button>
            {client.detected && client.client !== 'generic' && <Button disabled={!!busy} onClick={() => void preview(client)}>{tr('agents:preview')}</Button>}
          </div>
        </article>)}
        {!clients.length && !busy && <p>{tr('agents:no_clients')}</p>}
        {error === 'clients_error' && <Button variant="secondary" disabled={!!busy} onClick={() => void load()}>{tr('agents:retry')}</Button>}
      </div> : <section className="agents-preview">
        <h3>{tr(`agents:client_${setup.client.client}`)}</h3>
        <p>{tr(`agents:${setup.step === 'installed' ? 'installed' : 'preview_help'}`)}</p>
        <h4>{tr('agents:diff')}</h4>
        <pre className="agents-raw" data-testid="agent-install-diff">{setup.diff || tr('agents:no_change')}</pre>
        <div className="agents-actions">
          <Button variant="secondary" disabled={!!busy} onClick={() => setSetup({ step: 'choose' })}>{tr('agents:choose_client')}</Button>
          {setup.step === 'preview' && setup.changed && <Button disabled={!!busy} onClick={install}>{tr('agents:install')}</Button>}
        </div>
      </section>}
      <Button variant="secondary" disabled={!!busy} onClick={() => void run('doctor', async () => {
        setDoctor(null);
        const value = await desktop.invoke('mcp:doctor', {});
        if (alive.current) setDoctor(value);
      }, 'doctor_error')}>{tr('agents:test')}</Button>
      {doctor && <section className="agents-doctor"><h3>{tr(`agents:${doctor.ok ? 'doctor_ok' : 'doctor_failed'}`)}</h3>
        <ul>{doctor.checks.map((check, index) => <li key={index}><strong>{tr(`agents:${check.ok ? 'check_pass' : 'check_fail'}`)}</strong><span>{check.name}</span><span>{check.detail}</span></li>)}</ul>
      </section>}
      <p role="status">{busy ? tr(busy === 'clients' ? 'agents:loading' : 'agents:pending') : message ? tr(`agents:${message}`) : ''}</p>
      {error && <p role="alert">{tr(`agents:${error}`)}</p>}
      <div className="agents-actions"><Button variant="secondary" disabled={!!busy} onClick={onClose}>{tr('agents:close')}</Button></div>
    </DialogContent>
  </Dialog>;
}
