import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { SubscriptionUsage, SubscriptionWindow } from '../../shared/subscription-usage';
import { findCli } from './cli';
import { probeCodexWindows } from './rate-limits';
import { parseClaudeWindows } from './subscription-windows';
import { recordEgress } from '../services/egress';

type Result = { status: 'ready' | 'not-signed-in' | 'unsupported' | 'unavailable'; windows: SubscriptionWindow[] };
const credential = z.object({ claudeAiOauth: z.object({ accessToken: z.string().min(1).max(16384) }) });
async function readClaude(allowKeychain: boolean): Promise<Result> {
  let token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    let raw: string | undefined;
    try { raw = await readFile(join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.credentials.json'), 'utf8'); } catch { /* CLI credentials may live in the keychain instead. */ }
    if (!raw && allowKeychain && process.platform === 'darwin') {
      try { raw = (await promisify(execFile)('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 3000, maxBuffer: 1024 * 1024 })).stdout; } catch { return { status: 'not-signed-in', windows: [] }; }
    }
    if (raw) token = credential.parse(JSON.parse(raw)).claudeAiOauth.accessToken;
  }
  if (!token) return { status: 'not-signed-in', windows: [] };
  recordEgress('claude_quota', 'api.anthropic.com');
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (response.status === 401 || response.status === 403) return { status: 'not-signed-in', windows: [] };
  if (!response.ok) throw new Error('Quota unavailable');
  const text = await response.text();
  if (text.length > 1024 * 1024) throw new Error('Quota response too large');
  const windows = parseClaudeWindows(JSON.parse(text));
  return { status: windows.length ? 'ready' : 'unsupported', windows };
}

export function createSubscriptionReader(
  load: (provider: SubscriptionUsage['provider'], allowKeychain: boolean) => Promise<Result> = async (provider, allowKeychain) => {
    if (provider === 'claude') return readClaude(allowKeychain);
    const binary = await findCli('codex');
    if (!binary) return { status: 'unsupported', windows: [] };
    const windows = await probeCodexWindows(binary);
    return { status: windows === undefined ? 'unavailable' : windows.length ? 'ready' : 'not-signed-in', windows: windows ?? [] };
  },
  now = Date.now,
  codexEnabled = () => true,
) {
  type Entry = { value: SubscriptionUsage; failures: number; consent: boolean };
  const cache = new Map<SubscriptionUsage['provider'], Entry>();
  let pending: { consent: boolean; promise: Promise<SubscriptionUsage[]> } | undefined;
  let allowKeychain = false;
  let generation = 0;
  return (options: { refresh?: boolean | undefined; allowClaudeKeychain?: boolean | undefined } = {}): Promise<SubscriptionUsage[]> => {
    if (options.allowClaudeKeychain !== undefined) allowKeychain = options.allowClaudeKeychain;
    const consent = allowKeychain;
    if (pending?.consent === consent) return pending.promise;
    const mine = ++generation;
    const promise: Promise<SubscriptionUsage[]> = Promise.all((['claude', 'codex'] as const).map(async provider => {
      const previous = cache.get(provider);
      if (previous && previous.consent === consent && (!options.refresh || previous.failures > 0) && Date.parse(previous.value.nextRefreshAt) > now()) return previous.value;
      const result = provider === 'codex' && !codexEnabled() ? { status: 'unsupported' as const, windows: [] } : await load(provider, consent).catch((): Result => ({ status: 'unavailable', windows: [] }));
      const failures = result.status === 'unavailable' ? (previous?.consent === consent ? previous.failures : 0) + 1 : 0;
      const stale = failures > 0 && !!previous?.value.windows.length;
      const value: SubscriptionUsage = {
        provider, status: stale ? 'stale' : result.status,
        windows: stale ? previous!.value.windows : result.windows,
        fetchedAt: stale ? previous!.value.fetchedAt : result.status === 'ready' ? new Date(now()).toISOString() : null,
        nextRefreshAt: new Date(now() + Math.min(900000, 60000 * 2 ** Math.min(failures, 4))).toISOString(),
      };
      if (mine === generation) cache.set(provider, { value, failures, consent });
      return value;
    })).finally(() => { if (pending?.promise === promise) pending = undefined; });
    pending = { consent, promise };
    return promise;
  };
}
