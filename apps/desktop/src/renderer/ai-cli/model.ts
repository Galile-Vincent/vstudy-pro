/** Presentation rules derived from main-owned tool state; never builds executable commands. */
import type { CliActionId, CliProvider, CliToolState } from '../../shared/ai-cli';

export const cliProviders: CliProvider[] = ['claude', 'codex', 'agy'];
export const cliNames: Record<CliProvider, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' };
export type SetupStep = 'install' | 'login' | 'test';
export const setupSteps: SetupStep[] = ['install', 'login', 'test'];
export function currentStep(tool: CliToolState): SetupStep {
  if (tool.status === 'error' && tool.error.code === 'wrong-version') return 'install';
  if (tool.status === 'not-installed' || tool.status === 'installing' || (!tool.version && !tool.path)) return 'install';
  if (tool.status === 'installed-not-signed-in' || tool.status === 'signing-in' ||
      (tool.status === 'error' && ['login-expired', 'not-signed-in'].includes(tool.error.code))) return 'login';
  return 'test';
}
export function setupAction(provider: CliProvider, step: SetupStep): CliActionId {
  return `${step}-${provider}`;
}
/** A full snapshot may lose its prefix when main evicts capped output. Reset in that case. */
export function terminalDelta(previous: string, next: string) {
  return next.startsWith(previous) ? { reset: false, text: next.slice(previous.length) } : { reset: true, text: next };
}
/** Only explicit HTTPS links get a native confirmation; terminal escapes are never HTML. */
export function outputLinks(output: string): string[] {
  const printable = [...output].map(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159) ? ' ' : char).join('');
  return [...new Set(printable.match(/https:\/\/[^\s<>"']+/g) ?? [])].slice(0, 8).map(url => url.replace(/[).,;]+$/, ''));
}
