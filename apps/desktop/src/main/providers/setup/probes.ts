import { setupFailure } from '../../../shared/ai-setup-errors';
/**
 * Read actual provider auth state and exercise the existing tool-free transport for a tiny test.
 * Authentication JSON and provider responses never enter application logs or setup output.
 * @packageDocumentation
 */
import { captureCommand } from './captured';
import { recordEgress } from '../../services/egress';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { chatRequestSchema } from '../../../shared/domain';
import type { CliProvider } from '../../../shared/ai-cli';
import { cliEnvironment } from '../cli-transport';
import { agyArgs, runAgy } from '../agy';
import type { ProviderRegistry } from '../index';
import { providerId, SetupError } from './types';
import type { TerminalPlan } from './pty';

export async function probeVersion(binary: string, provider: CliProvider, expected: string | null, cwd: string, signal: AbortSignal) {
  const env = Object.fromEntries(Object.entries(cliEnvironment()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const { output, exitCode } = await captureCommand({ executable: binary, args: ['--version'], cwd, env }, signal, 10_000, 8192);
  if (exitCode !== 0) throw new SetupError('wrong-version');
  const version = output.match(/\b(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)\b/)?.[1];
  if (!version || expected && version !== expected || provider === 'codex' && version !== '0.166.0') throw new SetupError('wrong-version');
  return version;
}
export async function authStatus(provider: CliProvider, plan: TerminalPlan, signal: AbortSignal, capture = captureCommand): Promise<boolean> {
  if (provider === 'agy') {
    for await (const event of runAgy(plan.executable, agyArgs, plan.cwd, undefined, signal, 15_000)) {
      if (Array.isArray(event)) return true;
      if (event.type === 'error') {
        if (/sign.?in|log.?in|auth/i.test(event.message)) return false;
        throw new SetupError(/timeout/i.test(event.message) ? 'offline' : 'unknown');
      }
    }
    signal.throwIfAborted();
    throw new SetupError('unknown');
  }
  const statusPlan = { ...plan, args: provider === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status'] };
  recordEgress('ai_cli_status', provider === 'claude' ? 'Anthropic / Claude CLI managed endpoints' : 'OpenAI / Codex CLI managed endpoints');
  // Auth status is machine-readable, not interactive. A PTY makes Claude colour JSON keys,
  // which corrupts JSON even when exitCode is zero. Keep credentials in private pipe capture.
  const result = await capture(statusPlan, signal);
  if (provider === 'codex') {
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    throw new SetupError(setupFailure(result.output));
  }
  try {
    const text = result.output.trim();
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    const value = z.object({ loggedIn: z.boolean() }).parse(JSON.parse(text.slice(start, end + 1)));
    if (value.loggedIn && result.exitCode !== 0) throw new Error('Unexpected exit');
    return value.loggedIn;
  } catch { throw new SetupError('unknown'); }
}
export async function tinyTest(registry: Pick<ProviderRegistry, 'get'>, provider: CliProvider, signal: AbortSignal) {
  let text = '', done = false;
  const id = randomUUID();
  const request = { ...chatRequestSchema.parse({ scope: 'general' as const, requestId: id, conversationId: id, providerId: providerId(provider), modelId: provider === 'agy' ? 'gemini-3.8-flash-high' : 'default', userMessage: 'Reply with OK.' }), prompt: 'Reply with the single word OK. Do not use tools.', allowPresentation: false };
  for await (const event of registry.get(providerId(provider)).stream(request, signal)) {
    signal.throwIfAborted();
    if (event.type === 'error') throw new SetupError(setupFailure(event.message));
    if (event.type === 'tool-call') throw new SetupError('blocked');
    if (event.type === 'text-delta') text += event.text;
    if (text.length > 8192) throw new SetupError('blocked');
    if (event.type === 'done') done = true;
  }
  signal.throwIfAborted();
  if (!done || !text.trim()) throw new SetupError('unknown');
  return text;
}
