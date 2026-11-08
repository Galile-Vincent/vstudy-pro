/** Guided sign-in uses the existing confirmed link and session-scoped PTY input boundaries. */
import { useState } from 'react';
import type { CliActionSession } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { outputLinks, readableOutput } from './model';

export function SignInAction({ session }: { session: CliActionSession }) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const active = session.phase === 'running';
  const url = outputLinks(session.output)[0];
  const deviceCode = readableOutput(session.output).match(/(?:device|user|one.time|verification|security)\s+code(?:\s+is)?(?:\s*\([^)\n]*\))?\s*[:：]?\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+)/i)?.[1];
  const send = async () => {
    const value = code.trim();
    // A code is one bounded line. Never let a pasted newline submit additional terminal input.
    if (!active || sending || !value || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || new TextEncoder().encode(value).length > 4094) { setError(true); return; }
    setSending(true); setError(false);
    try { await desktop.invoke('ai-cli:input', { id: session.id, data: value + '\r' }); setCode(''); setSent(true); }
    catch { setError(true); }
    finally { setSending(false); }
  };
  return <section className="ai-cli-sign-in" aria-label={tr('ai-cli:step_login')}>
    <p role="status" className={session.phase === 'succeeded' ? 'ai-cli-success' : undefined}>{tr(session.phase === 'succeeded' ? 'ai-cli:signin_verified' : active ? sent ? 'ai-cli:code_sent' : url ? 'ai-cli:signin_waiting' : 'ai-cli:signin_preparing' : `ai-cli:phase_${session.phase}`)}</p>
    {active && <>
      {url && <div className="ai-cli-actions">
        <Button onClick={() => void desktop.invoke('shell:openExternal', { url }).catch(() => setError(true))}>{tr('ai-cli:open_signin')}</Button>
        <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setError(true))}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_signin_link')}</Button>
      </div>}
      {deviceCode && <p className="ai-cli-device-code">{tr('ai-cli:device_code')} <code>{deviceCode}</code></p>}
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <label htmlFor="ai-cli-returned-code">{tr('ai-cli:returned_code')}</label>
        <p id="ai-cli-code-help" className="muted">{tr('ai-cli:returned_code_help')}</p>
        <div className="ai-cli-code-row"><input id="ai-cli-returned-code" aria-describedby="ai-cli-code-help" autoComplete="off" spellCheck={false} value={code} maxLength={4094} disabled={sending} onChange={event => { setCode(event.target.value); setSent(false); }} />
          <Button type="submit" variant="secondary" disabled={sending || !code.trim()}>{tr('ai-cli:send_code')}</Button></div>
      </form>
    </>}
    {error && <p role="alert">{tr('ai-cli:terminal_error')}</p>}
  </section>;
}
