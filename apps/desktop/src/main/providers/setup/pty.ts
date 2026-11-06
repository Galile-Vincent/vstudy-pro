/**
 * Own one bounded PTY per setup action and await process-tree teardown on every exit path.
 * Raw output stays in the action's memory and is never logged.
 * @packageDocumentation
 */
import { execFile } from 'node:child_process';
import type { IPty, IPtyForkOptions } from 'node-pty';
import { systemExecutable } from '../../platform/process';
import { SetupError } from './types';
import { preparePtyHelper } from './pty-helper.mjs';
export { TerminalText } from './terminal-text';
export interface TerminalPlan { executable: string; args: readonly string[]; cwd: string; env: Readonly<Record<string, string>> }
export type PtySpawn = (file: string, args: string[], options: IPtyForkOptions) => IPty;
export interface PtyResult { exitCode: number; output: string }
export class ActionPty {
  private terminal: IPty | undefined;
  private inputBytes = 0;
  private inputWindow = { at: 0, bytes: 0 };
  constructor(private readonly spawn?: PtySpawn, private readonly prepareHelper = preparePtyHelper) {}
  write(data: string) {
    if (!this.terminal || Buffer.byteLength(data) > 4096) throw new SetupError('blocked');
    const bytes = Buffer.byteLength(data), now = Date.now();
    if (now - this.inputWindow.at > 1000) this.inputWindow = { at: now, bytes: 0 };
    this.inputWindow.bytes += bytes; this.inputBytes += bytes;
    if (this.inputBytes > 1_000_000 || this.inputWindow.bytes > 16_384) throw new SetupError('blocked');
    this.terminal.write(data);
  }
  resize(columns: number, rows: number) {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 20 || columns > 300 || rows < 5 || rows > 120) throw new SetupError('blocked');
    this.terminal?.resize(columns, rows);
  }
  async run(plan: TerminalPlan, signal: AbortSignal, output: (data: string) => void, timeout = 180_000): Promise<PtyResult> {
    signal.throwIfAborted();
    let spawn: PtySpawn;
    try { this.prepareHelper(); spawn = this.spawn ?? (await import('node-pty')).spawn; }
    catch { throw new SetupError('terminal-unavailable'); }
    signal.throwIfAborted();
    if (this.terminal) throw new SetupError('busy');
    const terminal = spawn(plan.executable, [...plan.args], { name: 'xterm-256color', cols: 90, rows: 24, cwd: plan.cwd, env: { ...plan.env }, encoding: 'utf8' });
    this.terminal = terminal;
    let diagnostic = '', bytes = 0, stopped = false;
    let stopError: SetupError | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const kill = async (hard: boolean) => {
      if (process.platform === 'win32') {
        await new Promise<void>(resolve => execFile(systemExecutable('taskkill.exe'), ['/PID', String(terminal.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
      } else {
        try { process.kill(-terminal.pid, hard ? 'SIGKILL' : 'SIGTERM'); } catch { /* The process group may already have exited. */ }
      }
      try { terminal.kill(hard ? 'SIGKILL' : 'SIGTERM'); } catch { /* Native PTY teardown may have completed. */ }
    };
    let finish!: (exitCode: number) => void;
    const exited = new Promise<number>(resolve => { finish = resolve; });
    const stop = (error: SetupError) => {
      if (stopped) return;
      stopped = true; stopError = error;
      void kill(false);
      escalation = setTimeout(() => { void kill(true).finally(() => finish(-1)); }, 250);
    };
    const abort = () => stop(new SetupError('cancelled'));
    const dataSubscription = terminal.onData(data => {
      bytes += Buffer.byteLength(data);
      if (bytes > 2_000_000) { stop(new SetupError('blocked')); return; }
      diagnostic = (diagnostic + data).slice(-262144);
      output(data);
    });
    const exitSubscription = terminal.onExit(({ exitCode }) => finish(exitCode));
    const timer = setTimeout(() => stop(new SetupError('browser-not-opened')), timeout);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      const exitCode = await exited;
      await kill(true);
      if (stopError) throw stopError;
      return { exitCode, output: diagnostic };
    } finally {
      clearTimeout(timer); if (escalation) clearTimeout(escalation);
      signal.removeEventListener('abort', abort); dataSubscription.dispose(); exitSubscription.dispose(); this.terminal = undefined;
    }
  }
}
