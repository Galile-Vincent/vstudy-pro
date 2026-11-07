import type { CliFailure } from './ai-cli';

type Recovery = { title: string; next: string; action: 'install' | 'login' | null };
export const setupErrors = {
  'not-installed': { title: 'not_installed', next: 'install', action: 'install' },
  'not-signed-in': { title: 'not_signed_in', next: 'login', action: 'login' },
  'login-expired': { title: 'expired', next: 'login', action: 'login' },
  certificate: { title: 'certificate', next: 'certificate', action: null },
  offline: { title: 'offline', next: 'reconnect', action: null },
  'permission-denied': { title: 'permission', next: 'permission', action: null },
  'command-not-found': { title: 'not_found', next: 'install', action: 'install' },
  'wrong-version': { title: 'version', next: 'install', action: 'install' },
  'rate-limit': { title: 'limit', next: 'wait', action: null },
  unknown: { title: 'unknown', next: 'retry', action: null },
} as const satisfies Record<string, Recovery>;
export type SetupIssue = keyof typeof setupErrors;
export function classifySetupError(code: string, rawText = ''): SetupIssue {
  const text = rawText.slice(0, 4000);
  if (code !== 'unknown' && code in setupErrors) return code as SetupIssue;
  if (/429|rate.?limit|quota|too many requests|resource.exhausted/i.test(text)) return 'rate-limit';
  if (/ENOENT|command not found|not recognized|executable[^\n]{0,80}not found/i.test(text)) return 'command-not-found';
  if (/EACCES|EPERM|permission denied/i.test(text)) return 'permission-denied';
  if (/certificate|CERT_HAS_EXPIRED|CERT_UNTRUSTED|UNABLE_TO_VERIFY|SELF_SIGNED_CERT/i.test(text)) return 'certificate';
  if (/invalid.grant/i.test(text) || /expired/i.test(text) && /auth|session|token|credential|sign.?in|log.?in/i.test(text)) return 'login-expired';
  if (/not.signed.in|unauthorized|authentication|log.?in|sign.?in/i.test(text)) return 'not-signed-in';
  if (/network|offline|fetch|ECONN|ENOTFOUND|timeout/i.test(text)) return 'offline';
  if (/unsupported.version|version[^\n]{0,80}(?:old|unsupported)/i.test(text)) return 'wrong-version';
  return 'unknown';
}
export function setupFailure(text: string): CliFailure {
  const issue = classifySetupError('', text);
  return issue === 'not-installed' ? 'command-not-found' : issue;
}
export function setupDiagnostic(input: { tool: string; version: string | null; os: string; exitCode: number | null; error: string }): string {
  const tool = ['Claude Code', 'Codex', 'Antigravity', 'claude', 'codex', 'agy'].includes(input.tool) ? input.tool : 'unknown';
  const version = input.version && /^v?\d+(?:\.\d+){1,3}(?:-[a-z0-9.-]{1,32})?$/i.test(input.version) ? input.version : 'unknown';
  const os = ['darwin', 'win32', 'linux'].includes(input.os) ? input.os : 'unknown';
  const exitCode = Number.isSafeInteger(input.exitCode) ? input.exitCode : 'unknown';
  return `Tool: ${tool}\nVersion: ${version}\nOS: ${os}\nExit code: ${exitCode}\nLast error: ${classifySetupError('unknown', input.error)}`;
}
