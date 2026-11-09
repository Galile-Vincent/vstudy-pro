/** Presentation rules derived from main-owned tool state; never builds executable commands. */
import type { CliActionId, CliProvider, CliToolState } from '../../shared/ai-cli';

export const cliProviders: CliProvider[] = ['claude', 'codex', 'agy'];
export const cliNames: Record<CliProvider, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' };
export type SetupStep = 'install' | 'login' | 'test';
export const setupSteps: SetupStep[] = ['install', 'login', 'test'];
export function currentStep(tool: CliToolState): SetupStep {
  if (tool.status === 'error' && ['wrong-version', 'command-not-found'].includes(tool.error.code)) return 'install';
  if (tool.status === 'not-installed' || tool.status === 'installing' || (!tool.version && !tool.path)) return 'install';
  if (tool.status === 'error' && tool.error.hint === 'cancelled' && tool.error.action) return tool.error.action;
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
/** Main removes terminal string controls; remove remaining CSI styling for guided text extraction. */
export function readableOutput(output: string): string {
  return output.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'), '');
}
/** Only explicit HTTPS links get a native confirmation; terminal escapes are never HTML. */
export function outputLinks(output: string): string[] {
  const printable = [...readableOutput(output)].map(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159) ? ' ' : char).join('');
  return [...new Set(printable.match(/https:\/\/[^\s<>"']+/g) ?? [])].slice(0, 8).map(url => url.replace(/[).,;]+$/, ''));
}

export function recommendedProvider(tools: CliToolState[]): CliProvider {
  const score = (tool: CliToolState) => tool.tested && tool.consented ? 4 : tool.status === 'ready' ? 3 : tool.path || tool.version ? 2 : tool.manualInstallRequired ? 0 : 1;
  return [...tools].sort((a, b) => score(b) - score(a))[0]?.provider ?? 'claude';
}

export type CliDetection = { kind: 'found'; version: string | null } | { kind: 'not-found' } | { kind: 'failed'; reason: string };
export function detectTool(tools: CliToolState[], provider: CliProvider): CliDetection {
  const tool = tools.find(item => item.provider === provider);
  return tool && tool.status !== 'not-installed' && (tool.version || tool.path) ? { kind: 'found', version: tool.version } : { kind: 'not-found' };
}
