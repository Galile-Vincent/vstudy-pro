/**
 * Main issues short-lived immutable command plans. Tokens belong to one window and are single-use.
 * @packageDocumentation
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { cliEnvironment } from '../cli-transport';
import { systemExecutable } from '../../platform/process';
import type { CliActionId, CliActionPlan, CliFailure, CliProvider } from '../../../shared/ai-cli';
import { SetupError, type Release } from './types';
import type { TerminalPlan } from './pty';
export type Verb = 'install' | 'update' | 'rollback' | 'login' | 'status' | 'test' | 'advanced-shell';
export interface ActionPlan extends TerminalPlan { public: CliActionPlan; provider: CliProvider | null; verb: Verb; binary: string | null; release: Release | null }
export function actionParts(action: CliActionId): { provider: CliProvider | null; verb: Verb } {
  if (action === 'advanced-shell') return { provider: null, verb: action };
  const [verb, provider] = action.split('-') as [Exclude<Verb, 'advanced-shell'>, CliProvider];
  return { verb, provider };
}
export function actionArgs(provider: CliProvider, verb: Verb): string[] {
  if (verb === 'status') return provider === 'claude' ? ['auth', 'status', '--json'] : provider === 'codex' ? ['login', 'status'] : ['acp', '--stdio', '--sandbox', '--include-default-customizations=false'];
  if (verb === 'login') return provider === 'claude' ? ['auth', 'login'] : provider === 'codex' ? ['login', '--device-auth'] : ['--sandbox', '--include-default-customizations=false'];
  return [];
}
/** Display-only quoting never becomes a shell command executed by main. */
export function displayCommand(executable: string, args: readonly string[], platform = process.platform) {
  const quote = (arg: string) => platform === 'win32' ? `"${arg.replaceAll('"', '\\"')}"` : `'${arg.replaceAll("'", "'\\''")}'`;
  return [executable, ...args].map(quote).join(' ');
}
export function buildPlan(actionId: CliActionId, cwd: string, binary: string | null, release: Release | null, reason: CliFailure | null, now: number, interpreters: readonly string[] = []): ActionPlan {
  const { provider, verb } = actionParts(actionId);
  let executable = binary ?? '', args = provider ? actionArgs(provider, verb) : [];
  if (!provider) { executable = process.platform === 'win32' ? systemExecutable('WindowsPowerShell\\v1.0\\powershell.exe') : '/bin/zsh'; args = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : ['-f']; }
  const env = Object.fromEntries(Object.entries(cliEnvironment()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  env.BROWSER = process.platform === 'win32' ? systemExecutable('where.exe') : '/usr/bin/true';
  env.TERM = 'xterm-256color';
  if (verb === 'login' && binary && process.platform === 'darwin') {
    const allowed = [binary, '/usr/bin/true', '/bin/sh', '/usr/bin/security', ...interpreters];
    const profile = `(version 1)(allow default)(deny process-exec)(allow process-exec ${allowed.map(path => `(literal ${JSON.stringify(path)})`).join(' ')})`;
    args = ['-p', profile, binary, ...args]; executable = '/usr/bin/sandbox-exec';
  }
  const command = verb === 'install' || verb === 'update'
    ? `VStudy download + verify ${release?.url ?? provider} -> ${join(cwd, provider ?? '', release?.version ?? '')}`
    : verb === 'rollback' ? `VStudy activate previous verified ${provider} version`
      : verb === 'test' ? `${displayCommand(executable, provider === 'agy' ? ['acp', '--stdio', '--sandbox'] : provider === 'claude' ? ['-p', '--safe-mode', '--tools', '', '--output-format', 'stream-json'] : ['exec', '--json', '--sandbox', 'read-only'])} [VStudy tool-free test]`
        : displayCommand(executable, args);
  return Object.freeze({ public: Object.freeze({ actionId, token: randomUUID(), command, cwd, available: reason === null, reason, expiresAt: now + 120_000 }), provider, verb, binary, executable, args: Object.freeze(args), cwd, env: Object.freeze(env), release: release ? Object.freeze({ ...release }) : null });
}
export class PreviewTokens<Owner extends object> {
  private readonly tokens = new Map<string, { owner: Owner; plan: ActionPlan }>();
  issue(owner: Owner, plan: ActionPlan) {
    for (const [token, entry] of this.tokens) if (entry.plan.public.expiresAt <= Date.now()) this.tokens.delete(token);
    if (this.tokens.size >= 100) throw new SetupError('busy');
    this.tokens.set(plan.public.token, { owner, plan });
    return { ...plan.public };
  }
  consume(owner: Owner, actionId: CliActionId, token: string, now: number) {
    const entry = this.tokens.get(token);
    if (!entry || entry.owner !== owner || entry.plan.public.actionId !== actionId) throw new SetupError('blocked');
    this.tokens.delete(token);
    if (entry.plan.public.expiresAt <= now || !entry.plan.public.available) throw new SetupError(entry.plan.public.reason ?? 'blocked');
    return entry.plan;
  }
  remove(owner: Owner) { for (const [token, entry] of this.tokens) if (entry.owner === owner) this.tokens.delete(token); }
  clear() { this.tokens.clear(); }
}
