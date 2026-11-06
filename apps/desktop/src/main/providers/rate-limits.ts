/**
 * Probe provider quota state with bounded subprocess and cache lifetimes.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { recordEgress } from '../services/egress';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { tmpdir } from 'node:os';
import { ProcessScope } from '../../../resources/converter/process-scope';
import { cliEnvironment, findCli } from './cli';
import type { Usage } from '../../shared/domain';
const windowSchema = z.object({ usedPercent: z.number().min(0).max(100), windowDurationMins: z.number().nullable().optional(), resetsAt: z.number().nullable().optional() });
/** Read Codex quota information through the bounded, opted-in discovery transport. */
export async function probeCodexRateLimits(binary: string, args = ['app-server'], timeoutMs = 2500): Promise<Usage['rateLimit']> {
  recordEgress('codex_quota', 'OpenAI / Codex CLI managed endpoints');
  const scope = new ProcessScope();
  const child = scope.spawn(binary, args, { cwd: tmpdir(), env: cliEnvironment(), shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin!.on('error', () => {});
  child.stderr!.resume();
  const lines = createInterface({ input: child.stdout! });
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<Usage['rateLimit']>(resolve => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
      child.once('error', () => resolve(undefined));
      child.once('close', () => resolve(undefined));
      let bytes = 0;
      const send = (frame: unknown) => child.stdin!.write(JSON.stringify(frame) + '\n');
      lines.on('line', line => {
        bytes += line.length;
        if (bytes > 1024 * 1024) { resolve(undefined); return; }
        try {
          const frame = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
          if (frame.error) { resolve(undefined); return; }
          if (frame.id === 1) {
            send({ method: 'initialized' });
            send({ id: 2, method: 'account/rateLimits/read', params: null });
          } else if (frame.id === 2) {
            const result = z.object({ rateLimits: z.object({ primary: windowSchema.nullable().optional(), secondary: windowSchema.nullable().optional() }) }).parse(frame.result);
            const windows = [result.rateLimits.primary,result.rateLimits.secondary].filter(w => w != null);
            const w = windows.sort((a,b) => b.usedPercent - a.usedPercent)[0];
            resolve(w ? { label: `${w.windowDurationMins ?? 'unknown'} minute window`, usedPercent: w.usedPercent, ...(w.resetsAt ? { resetsAt: new Date(w.resetsAt * 1000).toISOString() } : {}) } : undefined);
          }
        } catch { resolve(undefined); }
      });
      // Codex app-server exposes this read-only RPC; exec --json does not emit account limits.
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'vstudy', version: '0.1.0' }, capabilities: {} } });
    });
  } finally { clearTimeout(timer); lines.close(); await scope.dispose(); }
}
/** Create a cached quota probe that shares concurrent work and supports cleanup. */
export function createRateLimitProbe(load = async () => { if (process.platform !== 'darwin') return undefined; const binary = await findCli('codex'); return binary ? probeCodexRateLimits(binary) : undefined; }) {
  let cached: { expires: number; value: Usage['rateLimit'] } | undefined;
  let pending: Promise<Usage['rateLimit']> | undefined;
  return () => {
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    return pending ??= load().catch(() => undefined).then(value => { cached = { expires: Date.now() + 60_000, value }; return value; }).finally(() => { pending = undefined; });
  };
}
