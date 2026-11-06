/** Deterministic native payloads and publisher responses used only by backend tests. @packageDocumentation */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach } from 'vitest';
import type { Release } from './types';
import { VendorNetwork } from './network';
import { SetupStore } from './store';
import { executableIdentity } from '../trusted-executable';
import { SetupError } from './types';
import type { VerifyArtifact } from './authenticity';
/** Inject a fake authority only in Node tests; production stores always use publisher verification. */
export const fixtureArtifactVerifier: VerifyArtifact = async (release, binary, signal) => {
  signal.throwIfAborted();
  if (release.archive !== 'binary' || release.algorithm !== 'sha256' || (await executableIdentity(binary)).hash !== release.digest) throw new SetupError('signature');
};
export const fixtureStore = (root: string, verify: VerifyArtifact = fixtureArtifactVerifier) => new SetupStore(root, verify);
export function temporaryDirectories() {
  const directories: string[] = [];
  afterEach(async () => { for (const directory of directories) await rm(directory, { recursive: true, force: true }); directories.length = 0; });
  return async () => { const directory = await mkdtemp(join(tmpdir(), 'vstudy-setup-')); directories.push(directory); return directory; };
}
export function payloadRelease(payload: Buffer, version = '1.0.0', provider: Release['provider'] = 'claude'): Release {
  return { provider, version, url: provider === 'agy' ? 'https://storage.googleapis.com/antigravity-public/antigravity-cli/fixture.tar.gz' : 'https://downloads.claude.ai/fixture', notes: 'https://example.com/notes', algorithm: 'sha256', digest: createHash('sha256').update(payload).digest('hex'), size: payload.length, archive: 'binary', executable: provider, evidence: 'test fixture' };
}
export const payloadNetwork = (payload: Buffer) => new VendorNetwork(async () => new Response(new Uint8Array(payload)));
export function tarPayload(name: string, bytes: Buffer, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8'); header.write('0000700\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257);
  const sum = header.reduce((value, byte) => value + byte, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512 + 1024)]));
}
export class Owner extends EventEmitter { destroyed = false; isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; this.emit('destroyed'); } }
