/** Official copy-only installers. These commands are never executable embedded actions. @packageDocumentation */
import type { CliProvider } from './ai-cli';

export const cliInstallSources: Readonly<Record<CliProvider, string>> = {
  claude: 'https://code.claude.com/docs/en/setup',
  codex: 'https://developers.openai.com/codex/cli',
  agy: 'https://antigravity.google/docs/getting-started?tab=cli',
};

export function manualInstallCommand(provider: CliProvider, platform: string): string | null {
  if (provider === 'codex') return platform === 'darwin' ? 'curl -fsSL https://chatgpt.com/codex/install.sh | sh -s -- --release 0.166.0' : null;
  if (platform === 'win32') return provider === 'claude' ? 'irm https://claude.ai/install.ps1 | iex' : 'irm https://antigravity.google/cli/install.ps1 | iex';
  if (platform === 'darwin' || platform === 'linux') return provider === 'claude' ? 'curl -fsSL https://claude.ai/install.sh | bash' : 'curl -fsSL https://antigravity.google/cli/install.sh | bash';
  return null;
}
