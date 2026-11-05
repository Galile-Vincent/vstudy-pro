/** Account-scoped autologin lifecycle. A failed attempt also consumes the six-minute key budget. */
import { z } from 'zod';
import type { MoodleTokens } from './auth';
import type { Fetch } from './client';
import { moodleFetch } from './site-url';
import type { WebviewError } from '../../shared/moodle-webview';

export const AUTOLOGIN_INTERVAL = 6 * 60_000;
export class WebviewSessionError extends Error {
  constructor(readonly code:WebviewError, readonly retryAt:number|null = null) { super(code); }
}
export type WebviewSessionPhase = 'idle'|'authenticating'|'ready'|'expired'|'disposed';
export interface WebviewSessionPort {
  credentials(): Promise<MoodleTokens>;
  hasCookie(): Promise<boolean>;
  exchange(key:string,signal:AbortSignal): Promise<void>;
  clear(): Promise<void>;
}
async function autologinKey(response:Response):Promise<string> {
  if (!response.body) throw new WebviewSessionError('unavailable');
  const reader = response.body.getReader(), chunks:Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 64 * 1024) throw new WebviewSessionError('unavailable');
      chunks.push(chunk.value);
    }
  } finally {await reader.cancel().catch(() => undefined);reader.releaseLock();}
  try {return z.object({key:z.string().min(1).max(512).regex(/^[\w-]+$/)}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))).key;}
  catch {throw new WebviewSessionError('unavailable');}
}
export class MoodleWebviewSession {
  phase: WebviewSessionPhase = 'idle';
  get retryAt() { return this.budget.retryAt; }
  private pending: Promise<void> | undefined;
  private readonly abort = new AbortController();
  constructor(private readonly siteUrl:string, private readonly port:WebviewSessionPort, private readonly now:()=>number = Date.now, private readonly request:Fetch = moodleFetch, private readonly budget = {retryAt:0}) {}
  ensure(force = false): Promise<void> {
    if (this.pending) return this.pending;
    const pending = this.authenticate(force).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }
  private active() { if (this.abort.signal.aborted) throw new WebviewSessionError('session-expired'); }
  private async authenticate(force:boolean) {
    this.active();
    if (!force && await this.port.hasCookie()) { this.active(); this.phase = 'ready'; return; }
    if (this.now() < this.retryAt) { this.phase = 'expired'; throw new WebviewSessionError('session-expired',this.retryAt); }
    this.phase = 'authenticating';
    try {
      const credentials = await this.port.credentials();
      this.active();
      if (!credentials.privateToken) throw new WebviewSessionError('unavailable');
      this.budget.retryAt = this.now() + AUTOLOGIN_INTERVAL;
      const signal = AbortSignal.any([this.abort.signal,AbortSignal.timeout(30_000)]);
      const response = await this.request(this.siteUrl + '/webservice/rest/server.php',{
        method:'POST',redirect:'error',signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'MoodleMobile'},
        body:new URLSearchParams({wstoken:credentials.token,wsfunction:'tool_mobile_get_autologin_key',moodlewsrestformat:'json',privatetoken:credentials.privateToken}).toString(),
      });
      if (!response.ok) { await response.body?.cancel(); throw new WebviewSessionError('session-expired'); }
      const key = await autologinKey(response);
      this.active();
      await this.port.clear();
      this.active();
      await this.port.exchange(key,signal);
      this.active();
      if (!await this.port.hasCookie()) throw new WebviewSessionError('session-expired',this.retryAt);
      this.active();
      this.phase = 'ready';
    } catch (error) {
      if (!this.abort.signal.aborted) this.phase = 'expired';
      if (error instanceof WebviewSessionError) throw new WebviewSessionError(error.code,error.retryAt ?? (this.retryAt || null));
      throw new WebviewSessionError(error instanceof Error && /timeout/i.test(error.name) ? 'timeout' : 'offline',this.retryAt || null);
    }
  }
  async dispose() {
    this.phase = 'disposed';
    this.abort.abort();
    await this.pending?.catch(() => undefined);
    await this.port.clear();
  }
}
