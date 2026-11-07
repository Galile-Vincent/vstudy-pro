/**
 * Bounded vendor HTTPS requests. Every request and redirect enters the privacy inventory.
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import type { CliProvider } from '../../../shared/ai-cli';
import { recordEgress } from '../../services/egress';
import { SetupError, type Release } from './types';
export type Fetch = typeof fetch;
const hosts: Record<CliProvider, readonly string[]> = {
  claude: ['downloads.claude.ai'],
  codex: ['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'],
  agy: ['antigravity-cli-auto-updater-974169037036.us-central1.run.app', 'storage.googleapis.com'],
};
export function vendorUrl(provider: CliProvider, value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !hosts[provider].includes(url.hostname)) throw new SetupError('blocked');
  if (provider === 'agy' && url.hostname === 'storage.googleapis.com' && !url.pathname.startsWith('/antigravity-public/antigravity-cli/')) throw new SetupError('blocked');
  if (provider === 'codex' && ['github.com', 'api.github.com'].includes(url.hostname) && !/^\/(?:repos\/)?openai\/codex\//.test(url.pathname)) throw new SetupError('blocked');
  return url.href;
}
export class VendorNetwork {
  constructor(private readonly request: Fetch = fetch) {}
  private async response(provider: CliProvider, value: string, signal: AbortSignal): Promise<Response> {
    let url = vendorUrl(provider, value);
    for (let count = 0; count <= 5; count++) {
      signal.throwIfAborted();
      const target = new URL(url);
      recordEgress('ai_cli_download', target.origin + target.pathname);
      let response: Response;
      try { response = await this.request(url, { redirect: 'manual', signal, headers: { Accept: 'application/json, application/octet-stream, */*' } }); }
      catch (error) { signal.throwIfAborted(); throw error instanceof SetupError ? error : new SetupError('offline'); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) throw new SetupError('blocked');
        url = vendorUrl(provider, new URL(location, url).href);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new SetupError(response.status === 429 ? 'rate-limit' : response.status === 403 ? 'blocked' : 'offline'); }
      return response;
    }
    throw new SetupError('blocked');
  }
  private async *chunks(provider: CliProvider, url: string, cap: number, signal: AbortSignal) {
    const response = await this.response(provider, url, signal);
    const reader = response.body?.getReader();
    if (!reader) throw new SetupError('offline');
    let total = 0;
    try {
      const declared = Number(response.headers.get('content-length'));
      if (declared > cap) throw new SetupError('blocked');
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > cap) throw new SetupError('blocked');
        yield value;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  async bytes(provider: CliProvider, url: string, signal: AbortSignal, cap = 2_000_000) {
    const buffers: Uint8Array[] = [];
    for await (const chunk of this.chunks(provider, url, cap, signal)) buffers.push(chunk);
    return Buffer.concat(buffers);
  }
  async text(provider: CliProvider, url: string, signal: AbortSignal, cap = 2_000_000) {
    return (await this.bytes(provider, url, signal, cap)).toString('utf8');
  }
  async download(release: Release, destination: string, signal: AbortSignal, progress: (bytes: number) => void) {
    const file = await open(destination, 'wx', 0o600);
    const hash = createHash(release.algorithm);
    let bytes = 0;
    try {
      for await (const chunk of this.chunks(release.provider, release.url, release.size ?? 600_000_000, signal)) {
        await file.writeFile(chunk); hash.update(chunk); bytes += chunk.length; progress(bytes);
      }
      if (!bytes || release.size !== null && bytes !== release.size || hash.digest('hex') !== release.digest) throw new SetupError('checksum');
      await file.sync();
    } catch (error) { await file.close(); await rm(destination, { force: true }); throw error; }
    await file.close();
  }
}
