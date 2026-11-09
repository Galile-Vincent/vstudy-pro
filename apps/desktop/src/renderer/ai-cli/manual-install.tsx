/** Plain copy-and-paste steps; only main can open an external terminal, never run this installer. */
import { useEffect, useRef, useState } from 'react';
import type { CliProvider } from '../../shared/ai-cli';
import { cliInstallSources, manualInstallCommand } from '../../shared/ai-cli-manual';
import { desktopPlatform } from '../../shared/platform';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import type { CliDetection } from './model';

export function ManualInstallReason({ provider }: { provider: CliProvider }) {
  const [error, setError] = useState(false);
  return <div className="ai-cli-manual-reason"><p>{tr('ai-cli:manual_install_reason')}</p>
    <Button variant="link" onClick={() => { setError(false); void desktop.invoke('shell:openExternal', { url: cliInstallSources[provider] }).catch(() => setError(true)); }}>{tr('ai-cli:official_source')}</Button>
    {error && <p role="alert">{tr('ai-cli:manual_link_error')}</p>}
  </div>;
}

export type ManualNotice = 'opened' | CliDetection;

export function manualNoticeText(notice: ManualNotice) {
  return notice === 'opened' ? tr('ai-cli:manual_terminal_opened') : notice.kind === 'found' ? notice.version ? tr('ai-cli:manual_found_version', { version: notice.version }) : tr('ai-cli:manual_found') : tr(notice.kind === 'failed' ? 'ai-cli:manual_check_failed' : 'ai-cli:manual_not_found');
}

export function ManualInstall({ provider, required = false, busy = false, onCheck, onNotice }: { provider: CliProvider; required?: boolean | undefined; busy?: boolean; onCheck: (provider: CliProvider) => Promise<CliDetection>; onNotice: (notice: ManualNotice | undefined) => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState<'copy' | 'terminal'>();
  const [pending, setPending] = useState(false);
  const mounted = useRef(true), locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const platform = desktopPlatform(), windows = platform === 'win32';
  const command = manualInstallCommand(provider, platform);
  const act = async (terminal: boolean) => {
    if (locked.current || busy) return;
    locked.current = true; setPending(true); setError(undefined); onNotice(undefined);
    try {
      if (terminal) {
        const plan = await desktop.invoke('ai-cli:preview', { actionId: `terminal-${provider}` });
        if (!mounted.current) return;
        if (!plan.available) throw new Error('Terminal unavailable');
        const result = await desktop.invoke('ai-cli:openTerminal', { actionId: plan.actionId, token: plan.token });
        if (mounted.current && result.ok) onNotice('opened');
      } else {
        const detection = await onCheck(provider);
        onNotice(detection);
      }
    } catch { if (mounted.current) setError('terminal'); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  };
  return <details className="ai-cli-help ai-cli-manual" open={required || undefined}><summary>{tr('ai-cli:manual_install')}</summary>
    {command ? <>
      <ol className="ai-cli-manual-steps">
        <li>{tr('ai-cli:manual_step_copy')}</li>
        <li>{tr(windows ? 'ai-cli:manual_step_terminal_windows' : platform === 'darwin' ? 'ai-cli:manual_step_terminal' : 'ai-cli:manual_step_terminal_other')}</li>
        <li>{tr('ai-cli:manual_step_return')}</li>
      </ol>
      <pre className="ai-cli-output"><code>{command}</code></pre>
      <div className="ai-cli-actions">
        <Button variant="secondary" data-manual-copy disabled={busy || pending} onClick={() => void navigator.clipboard.writeText(command).then(() => { setCopied(true); setError(undefined); }).catch(() => setError('copy'))}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_command')}</Button>
        <Button variant="secondary" data-manual-terminal disabled={busy || pending} onClick={() => void act(true)}>{tr(windows ? 'ai-cli:open_terminal_windows' : 'ai-cli:open_terminal')}</Button>
      </div>
      <Button className="ai-cli-manual-check" data-manual-check disabled={busy || pending} onClick={() => void act(false)}>{tr(pending ? 'ai-cli:manual_working' : 'ai-cli:check_again')}</Button>
    </> : <p>{tr('ai-cli:failure_unsupported')}</p>}
    {error && <p role="alert">{tr(error === 'copy' ? 'ai-cli:copy_error' : 'ai-cli:manual_terminal_error')}</p>}
    {!required && <ManualInstallReason provider={provider} />}
  </details>;
}
