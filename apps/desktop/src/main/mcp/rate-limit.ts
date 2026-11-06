/** Bound client request bursts and space backend starts without retrying remote mutations. @packageDocumentation */
import { McpFailure } from './errors';

/** Buckets use grant IDs; clients cannot reset limits by opening another socket. */
export class CallLimiter {
  private global: number[] = [];
  private readonly clients = new Map<string, number[]>();
  private readonly sync = new Map<string, number>();
  private nextStart = 0;
  constructor(private readonly now = Date.now, private readonly spacingMs = 150, private readonly jitterMs = 100) {}

  admit(grantId: string): number {
    const now = this.now();
    this.global = this.global.filter(at => at > now - 60_000);
    const recent = (this.clients.get(grantId) ?? []).filter(at => at > now - 60_000);
    if (this.global.length >= 120 || recent.length >= 30) throw new McpFailure('RATE_LIMITED');
    this.global.push(now);
    recent.push(now);
    this.clients.set(grantId, recent);
    for (const [id, times] of this.clients) if (times.at(-1)! <= now - 60_000) this.clients.delete(id);
    return this.startDelay();
  }

  startDelay(): number {
    const now = this.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + this.spacingMs + Math.floor(Math.random() * (this.jitterMs + 1));
    return start - now;
  }

  admitSync(accountId: string): void {
    const now = this.now();
    if (now - (this.sync.get(accountId) ?? -Infinity) < 60_000) throw new McpFailure('RATE_LIMITED');
    this.sync.set(accountId, now);
    for (const [id, at] of this.sync) if (at <= now - 60_000) this.sync.delete(id);
  }
}

/** Cancellation wakes queued work before it can enter the backend. */
export function waitForStart(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    timer.unref();
    signal.addEventListener('abort', abort, {once: true});
  });
}
