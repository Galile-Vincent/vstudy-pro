/** Publisher metadata, signature, redirect, and streaming integrity acceptance tests. @packageDocumentation */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseSource, claudeFingerprint, platformKey, verifyClaudeManifest } from './releases';
import { VendorNetwork, vendorUrl } from './network';
import { networkActivity } from '../../services/egress';
import { payloadRelease, temporaryDirectories } from './test-fixtures';
const temporary = temporaryDirectories();
const recorded = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));
const signal = () => AbortSignal.timeout(5000);
it('verifies the recorded Claude binary signature and refuses changed bytes, key, or signature', async () => {
  const manifest = await recorded('claude-manifest.json'), signature = await recorded('claude-manifest.json.sig'), key = await recorded('claude-code.asc');
  const original = manifest;
  await expect(verifyClaudeManifest(original.toString(), signature, key.toString())).resolves.toBeUndefined();
  await expect(verifyClaudeManifest(manifest.toString() + ' ', signature, key.toString())).rejects.toMatchObject({ code: 'signature' });
  await expect(verifyClaudeManifest(original.toString(), Buffer.from('bad signature'), key.toString())).rejects.toMatchObject({ code: 'signature' });
  await expect(verifyClaudeManifest(original.toString(), signature, key.toString(), '0'.repeat(40))).rejects.toMatchObject({ code: 'signature' });
  expect(claudeFingerprint).toBe('31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE');
});
it('parses recorded publisher manifests including Windows and underscore agy platforms', async () => {
  const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const name = url.endsWith('/latest') && url.includes('claude') ? null : url.endsWith('.sig') ? 'claude-manifest.json.sig' : url.endsWith('.asc') ? 'claude-code.asc' : url.includes('claude') ? 'claude-manifest.json' : url.includes('github') ? 'codex-release.json' : 'agy-manifest.json';
    return new Response(name ? new Uint8Array(await recorded(name)) : '2.1.318');
  });
  const source = new ReleaseSource(new VendorNetwork(request), 'darwin', 'arm64');
  expect(await source.latest('claude', signal())).toMatchObject({ version: '2.1.318', algorithm: 'sha256', size: 319598464, archive: 'binary' });
  expect(await source.latest('agy', signal())).toMatchObject({ version: '1.5.1', algorithm: 'sha512', executable: 'antigravity', archive: 'tar.gz' });
  expect(await source.installable('codex', signal())).toMatchObject({ version: '0.166.0', digest: 'c48824462fc57681eafb0925d97b11b589010475613904f570b42fea53e240d5' });
  expect(request.mock.calls.some(([url]) => String(url).endsWith('/manifests/darwin_arm64.json'))).toBe(true);
  expect(platformKey('agy', 'win32', 'x64')).toBe('windows_amd64');
  expect(platformKey('claude', 'win32', 'arm64')).toBe('win32-arm64');
  expect(() => platformKey('codex', 'win32', 'x64')).toThrow('unsupported');
});
it('requires the official Codex digest even on a matching audited version', async () => {
  const recordedRelease = JSON.parse((await recorded('codex-release.json')).toString());
  recordedRelease.assets[0].digest = null;
  const source = new ReleaseSource(new VendorNetwork(async () => Response.json(recordedRelease)), 'darwin', 'arm64');
  await expect(source.installable('codex', signal())).rejects.toMatchObject({ code: 'checksum' });
});
describe('vendor network', () => {
  it.each(['http://downloads.claude.ai/a', 'https://downloads.claude.ai.evil.test/a', 'https://user@downloads.claude.ai/a', 'https://downloads.claude.ai:8443/a'])('rejects %s before a request', async url => {
    const request = vi.fn(); const network = new VendorNetwork(request);
    await expect(network.text('claude', url, signal())).rejects.toMatchObject({ code: 'blocked' }); expect(request).not.toHaveBeenCalled();
  });
  it('checks and inventories every redirect and rejects a foreign host', async () => {
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://attacker.test/payload' } }));
    await expect(new VendorNetwork(request).text('claude', 'https://downloads.claude.ai/a', signal())).rejects.toMatchObject({ code: 'blocked' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(networkActivity().at(-1)).toMatchObject({ what: 'ai_cli_download', to: 'https://downloads.claude.ai/a' });
    expect(() => vendorUrl('agy', 'https://storage.googleapis.com/unrelated/a')).toThrow('blocked');
  });
  it('streams exact-size payloads and deletes checksum failures', async () => {
    const directory = await temporary(), payload = Buffer.from('verified native binary'), release = payloadRelease(payload);
    const network = new VendorNetwork(async () => new Response(new Uint8Array(payload)));
    const progress = vi.fn();
    await network.download(release, join(directory, 'ok'), signal(), progress);
    expect(await readFile(join(directory, 'ok'))).toEqual(payload); expect(progress).toHaveBeenLastCalledWith(payload.length);
    await expect(network.download({ ...release, digest: '0'.repeat(64) }, join(directory, 'bad'), signal(), () => {})).rejects.toMatchObject({ code: 'checksum' });
    await expect(readFile(join(directory, 'bad'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(network.download({ ...release, size: 2 }, join(directory, 'too-big'), signal(), () => {})).rejects.toMatchObject({ code: 'blocked' });
  });
  it('bounds metadata even when the server omits content-length', async () => {
    const network = new VendorNetwork(async () => new Response('0123456789'));
    await expect(network.text('claude', 'https://downloads.claude.ai/a', signal(), 3)).rejects.toMatchObject({ code: 'blocked' });
  });
});
