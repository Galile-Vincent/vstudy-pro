/**
 * Main-owned setup domain and transition table. External metadata is parsed before use.
 * @packageDocumentation
 */
import { z } from 'zod';
import type { CliFailure, CliProvider, CliToolState } from '../../../shared/ai-cli';

export const providers = ['claude', 'codex', 'agy'] as const;
export const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/).max(100);
export const releaseSchema = z.object({
  provider: z.enum(providers), version: versionSchema,
  url: z.string().url(), notes: z.string().url(),
  algorithm: z.enum(['sha256', 'sha512']), digest: z.string().regex(/^[a-f0-9]{64}(?:[a-f0-9]{64})?$/),
  size: z.number().int().positive().max(600_000_000).nullable(),
  archive: z.enum(['binary', 'tar.gz']), executable: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  evidence: z.string().max(2_000_000),
}).strict().superRefine((r, ctx) => {
  if (r.digest.length !== (r.algorithm === 'sha256' ? 64 : 128)) ctx.addIssue({ code: 'custom', message: 'Digest length' });
});
export type Release = z.infer<typeof releaseSchema>;
export class SetupError extends Error {
  constructor(readonly code: CliFailure) { super(`ai-cli.${code}`); }
}
export function failure(error: unknown): CliFailure {
  if (error instanceof SetupError) return error.code;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied';
  if (code === 'ENOSPC' || code === 'EROFS') return 'blocked';
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  if (error instanceof Error && /auth|log.?in|sign.?in/i.test(error.message)) return 'not-signed-in';
  if (error instanceof Error && /network|fetch|ECONN|ENOTFOUND|timeout/i.test(error.message)) return 'offline';
  return 'unknown';
}
export type SetupEvent = { type: 'install' | 'update' | 'login' | 'installed' | 'ready' | 'available' | 'unsigned' | 'missing' }
  | { type: 'failed'; code: CliFailure };
const transitions: Record<Exclude<SetupEvent['type'], 'failed'>, { from: readonly CliToolState['status'][]; to: Exclude<CliToolState['status'], 'error'> }> = {
  install: { from: ['not-installed', 'installed-not-signed-in', 'error'], to: 'installing' },
  update: { from: ['ready', 'update-available', 'installed-not-signed-in', 'error'], to: 'updating' },
  login: { from: ['installed-not-signed-in', 'ready', 'update-available', 'error'], to: 'signing-in' },
  installed: { from: ['installing', 'updating', 'error'], to: 'installed-not-signed-in' },
  ready: { from: ['installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'error'], to: 'ready' },
  available: { from: ['ready', 'update-available'], to: 'update-available' },
  unsigned: { from: ['installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'error'], to: 'installed-not-signed-in' },
  missing: { from: ['not-installed', 'installed-not-signed-in', 'ready', 'update-available', 'error'], to: 'not-installed' },
};
export function transition(state: CliToolState, event: SetupEvent): CliToolState {
  if (event.type === 'failed') return { ...state, status: 'error', error: { code: event.code, hint: event.code } };
  const rule = transitions[event.type];
  if (!rule.from.includes(state.status)) throw new SetupError('busy');
  return { ...state, status: rule.to, error: null };
}
export function initialState(provider: CliProvider): CliToolState {
  return { provider, status: 'not-installed', consented: false, version: null, path: null, managed: false,
    latestVersion: null, releaseNotesUrl: null, checkedAt: null, previousVersion: null, appliesToNewChats: false, tested: false, error: null };
}
export const providerId = (provider: CliProvider) => `${provider}-cli` as const;
export function newer(candidate: string, current: string | null): boolean {
  if (!current) return true;
  const a = candidate.split(/[.+-]/).slice(0, 3).map(Number), b = current.split(/[.+-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i]! > b[i]!; }
  return false;
}
