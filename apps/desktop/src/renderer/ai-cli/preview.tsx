/** Main-issued action preview. Renderer never accepts a command, cwd, executable path, or environment. */
import { useState } from 'react';
import type { CliActionPlan } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';

export function ActionPreview({ plan, busy, run }: { plan: CliActionPlan; busy: boolean; run: (ownTerminal?: boolean) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const native = /^(install|update|rollback)-/.test(plan.actionId);
  return <section id="ai-cli-preview" tabIndex={-1} className="ai-cli-preview" aria-label={tr('ai-cli:preview')}>
    <h3>{tr('ai-cli:preview')}</h3>
    <p>{tr(native ? plan.actionId.startsWith('rollback-') ? 'ai-cli:rollback_plan' : 'ai-cli:native_plan' : 'ai-cli:command_plan')}</p>
    <dl><div><dt>{tr(native ? 'ai-cli:plan' : 'ai-cli:command')}</dt><dd><code tabIndex={0} aria-label={tr(native ? 'ai-cli:plan' : 'ai-cli:command')}>{plan.command}</code></dd></div><div><dt>{tr('ai-cli:cwd')}</dt><dd><code>{plan.cwd}</code></dd></div></dl>
    {!plan.available && <p role="alert">{tr(`ai-cli:failure_${plan.reason ?? 'unknown'}`)}</p>}
    <div className="ai-cli-actions">
      <Button disabled={busy || !plan.available} onClick={() => void run()}>{tr(native ? 'ai-cli:run_native' : 'ai-cli:run')}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => void navigator.clipboard.writeText(plan.command).then(() => { setCopied(true); setCopyError(false); }).catch(() => setCopyError(true))}>{tr(copied ? 'ai-cli:copied' : native ? 'ai-cli:copy_plan' : 'ai-cli:copy_command')}</Button>
      {!native && <Button variant="ghost" disabled={busy || !plan.available && !(plan.reason === 'unsupported' && plan.actionId.startsWith('login-'))} onClick={() => void run(true)}>{tr('ai-cli:own_terminal')}</Button>}
    </div>
    {copyError && <p role="alert">{tr('ai-cli:copy_error')}</p>}
  </section>;
}
