import type { CliFailure } from './ai-cli';
import { redact } from './redact';

type Recovery = { title: string; next: string; action: 'install' | 'login' | null };
export const setupErrors = {
  'not-installed': { title: 'not_installed', next: 'install', action: 'install' },
  'not-signed-in': { title: 'not_signed_in', next: 'login', action: 'login' },
  'login-expired': { title: 'expired', next: 'login', action: 'login' },
  offline: { title: 'offline', next: 'reconnect', action: null },
  'permission-denied': { title: 'permission', next: 'permission', action: null },
  'command-not-found': { title: 'not_found', next: 'install', action: 'install' },
  'wrong-version': { title: 'version', next: 'install', action: 'install' },
  'rate-limit': { title: 'limit', next: 'wait', action: null },
  unknown: { title: 'unknown', next: 'retry', action: null },
} as const satisfies Record<string, Recovery>;
export type SetupIssue = keyof typeof setupErrors;
export function classifySetupError(code: string, text = ''): SetupIssue {
  if (code !== 'unknown' && code in setupErrors) return code as SetupIssue;
  if (/429|rate.?limit|quota|too many requests|resource.exhausted/i.test(text)) return 'rate-limit';
  if (/ENOENT|command not found|not recognized|executable.*not found/i.test(text)) return 'command-not-found';
  if (/EACCES|EPERM|permission denied/i.test(text)) return 'permission-denied';
  if (/expired|invalid.grant/i.test(text)) return 'login-expired';
  if (/not.signed.in|unauthorized|authentication|log.?in|sign.?in/i.test(text)) return 'not-signed-in';
  if (/network|offline|fetch|ECONN|ENOTFOUND|timeout/i.test(text)) return 'offline';
  if (/unsupported.version|version.*(?:old|unsupported)/i.test(text)) return 'wrong-version';
  return 'unknown';
}
export function setupFailure(text: string): CliFailure {
  const issue = classifySetupError('', text);
  return issue === 'not-installed' ? 'command-not-found' : issue;
}
export function setupDiagnostic(input: { tool: string; version: string | null; os: string; exitCode: number | null; error: string }): string {
  return redact(`Tool: ${input.tool}\nVersion: ${input.version ?? 'unknown'}\nOS: ${input.os}\nExit code: ${input.exitCode ?? 'unknown'}\nLast error: ${input.error.slice(-4000)}`);
}
