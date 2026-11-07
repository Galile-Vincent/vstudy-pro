/**
 * Bounded private command results for version checks and post-login credential verification.
 * Abort and timeout await process-tree teardown. Captured output never leaves main.
 * @packageDocumentation
 */
import { spawn } from 'node:child_process';
import { terminateProcess } from '../../platform/process';
import type { TerminalPlan } from './pty';
import { failure, SetupError } from './types';
export async function captureCommand(plan: TerminalPlan, signal: AbortSignal, timeout = 15_000, cap = 262144) {
  signal.throwIfAborted();
  const child = spawn(plan.executable, [...plan.args], { cwd: plan.cwd, env: { ...plan.env }, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', bytes = 0, error: SetupError | undefined;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const stop = (reason: SetupError) => {
    if (error) return;
    error = reason;
    void terminateProcess(child, 'SIGTERM');
    escalation = setTimeout(() => { void terminateProcess(child, 'SIGKILL'); }, 250);
  };
  const collect = (data: Buffer) => {
    bytes += data.length;
    if (bytes > cap) stop(new SetupError('blocked'));
    else output += data.toString('utf8');
  };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  const closed = new Promise<number>(resolve => {
    child.once('error', cause => { error ??= new SetupError(failure(cause)); resolve(-1); });
    child.once('close', code => resolve(code ?? -1));
  });
  const abort = () => stop(new SetupError('cancelled'));
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => stop(new SetupError('offline')), timeout);
  if (signal.aborted) abort();
  try {
    const exitCode = await closed;
    if (error) throw error;
    return { exitCode, output };
  } finally {
    clearTimeout(timer); if (escalation) clearTimeout(escalation);
    signal.removeEventListener('abort', abort); await terminateProcess(child, 'SIGKILL');
  }
}
