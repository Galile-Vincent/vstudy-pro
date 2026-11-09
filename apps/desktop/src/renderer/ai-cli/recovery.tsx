import { useState } from 'react';
import type { CliActionSession, CliFailure, CliToolState } from '../../shared/ai-cli';
import { classifySetupError, setupDiagnostic, setupErrors } from '../../shared/ai-setup-errors';
import { desktopPlatform } from '../../shared/platform';
import { tr } from '../../shared/i18n';
import { Toolbar } from '../components/ui';
import { Button } from '../components/ui/button';
import { cliNames } from './model';

export function SetupRecovery({ failure, tool, session, busy, onAction }: {
  failure: CliFailure; tool: CliToolState; session: CliActionSession | undefined; busy: boolean;
  onAction: (action: 'install' | 'login' | null) => void;
}) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const classified = classifySetupError(failure, session?.output);
  const issue = setupErrors[classified];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(setupDiagnostic({ tool: cliNames[tool.provider], version: tool.version, os: desktopPlatform(), exitCode: session?.exitCode ?? null, error: session?.output || failure }));
      setCopied(true); setCopyError(false);
    } catch { setCopyError(true); }
  };
  return <div className="ai-cli-recovery" role="alert">
    <strong>{tr(classified === 'unknown' && failure !== 'unknown' ? `ai-cli:failure_${failure}` : `ai-cli:error_title_${issue.title}`)}</strong>
    <p>{tr(`ai-cli:error_next_${issue.next}`)}</p>
    <Toolbar left={<>
      <Button variant="secondary" disabled={busy || !tool.consented} onClick={() => onAction(issue.action)}>{tr('ai-cli:retry')}</Button>
      <Button variant="ghost" onClick={() => void copy()}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_details')}</Button>
    </>} />
    {copyError && <p>{tr('ai-cli:copy_error')}</p>}
  </div>;
}
