/** Main-issued action preview. Renderer never accepts a command, cwd, executable path, or environment. */
import { useState } from 'react';
import type { CliActionPlan } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';

export function ActionPreview({ plan, busy, run, guided = false, hideAction = false }: { hideAction?: boolean; guided?: boolean; plan: CliActionPlan; busy: boolean; run: (ownTerminal?: boolean) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const test = plan.actionId.startsWith('test-');
  const protocolStatus = plan.actionId === 'status-agy';
  const native = /^(install|update|rollback|test)-/.test(plan.actionId) || protocolStatus;
  return <section id="ai-cli-preview" tabIndex={-1} className="ai-cli-preview" aria-label={tr('ai-cli:preview')}>
    {!guided && <h3>{tr('ai-cli:preview')}</h3>}
    <div className="ai-cli-actions">
      {!hideAction && <Button disabled={busy || !plan.available} onClick={() => void run()}>{tr(guided ? `ai-cli:step_${plan.actionId.split('-')[0]}` : test ? 'ai-cli:test_it' : native ? 'ai-cli:run_native' : 'ai-cli:run')}</Button>}
    </div>
    <details className="ai-cli-plan-details ai-cli-alternatives"><summary>{tr('ai-cli:other_actions')}</summary><Button variant="ghost" disabled={busy} onClick={() => void navigator.clipboard.writeText(plan.command).then(() => { setCopied(true); setCopyError(false); }).catch(() => setCopyError(true))}>{tr(copied ? 'ai-cli:copied' : native ? 'ai-cli:copy_plan' : 'ai-cli:copy_command')}</Button>
      {!native && <Button variant="ghost" disabled={busy || !plan.available && !(plan.reason === 'unsupported' && plan.actionId.startsWith('login-'))} onClick={() => void run(true)}>{tr('ai-cli:own_terminal')}</Button>}

    <p>{tr(test ? 'ai-cli:test_plan' : protocolStatus ? 'ai-cli:status_plan' : native ? plan.actionId.startsWith('rollback-') ? 'ai-cli:rollback_plan' : 'ai-cli:native_plan' : 'ai-cli:command_plan')}</p>
    <dl><div><dt>{tr(native ? 'ai-cli:plan' : 'ai-cli:command')}</dt><dd><code tabIndex={0} aria-label={tr(native ? 'ai-cli:plan' : 'ai-cli:command')}>{plan.command}</code></dd></div><div><dt>{tr('ai-cli:cwd')}</dt><dd><code>{plan.cwd}</code></dd></div></dl></details>
    {copyError && <p role="alert">{tr('ai-cli:copy_error')}</p>}
  </section>;
}
