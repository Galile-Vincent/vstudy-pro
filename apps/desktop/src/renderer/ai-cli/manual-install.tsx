/** Copy-only official installer fallback. Renderer never submits these strings to main for execution. */
import { useState } from 'react';
import type { CliProvider } from '../../shared/ai-cli';
import { desktopPlatform } from '../../shared/platform';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';

export function ManualInstall({ provider, required = false }: { provider: CliProvider; required?: boolean | undefined }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  const windows = desktopPlatform() === 'win32';
  const commands = {
    claude: windows ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash',
    codex: windows ? null : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh -s -- --release 0.166.0',
    agy: windows ? 'irm https://antigravity.google/cli/install.ps1 | iex' : 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
  };
  const command = commands[provider];
  return <details className="ai-cli-help" open={required || undefined}><summary>{tr('ai-cli:manual_install')}</summary>
    {required && <p>{tr('ai-cli:manual_install_reason')}</p>}
    <p>{tr('ai-cli:manual_install_help')}</p>
    {command ? <><pre className="ai-cli-output"><code>{command}</code></pre><Button variant={required ? 'default' : 'secondary'} onClick={() => void navigator.clipboard.writeText(command).then(() => { setCopied(true); setError(false); }).catch(() => setError(true))}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_command')}</Button></> : <p>{tr('ai-cli:failure_unsupported')}</p>}
    {error && <p role="alert">{tr('ai-cli:copy_error')}</p>}
  </details>;
}
