/** Publisher proof is independent of feed digests and is rechecked before probes and record reuse. @packageDocumentation */
import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMessage, generateKey, readPrivateKey, sign } from 'openpgp';
import { expect, it, vi } from 'vitest';
import { artifactVerifier, codexPin, manualInstallation } from './authenticity';
import { claudeFingerprint } from './publisher';
import { SetupStore } from './store';
import { payloadNetwork, payloadRelease, temporaryDirectories } from './test-fixtures';
import { fixtureBinary } from './native-fixtures';

const temporary = temporaryDirectories();
const signal = () => AbortSignal.timeout(5000);
async function signedRelease(bytes: Buffer) {
  const keys = await generateKey({ type: 'ecc', curve: 'ed25519Legacy', userIDs: [{ name: 'Isolated fixture publisher' }], format: 'armored' });
  const privateKey = await readPrivateKey({ armoredKey: keys.privateKey });
  const release = payloadRelease(bytes);
  const manifest = JSON.stringify({ version: release.version, platforms: { [`${process.platform}-${process.arch}`]: { binary: process.platform === 'win32' ? 'claude.exe' : 'claude', checksum: release.digest, size: bytes.length } } });
  const signature = await sign({ message: await createMessage({ binary: Buffer.from(manifest) }), signingKeys: privateKey, detached: true, format: 'binary' });
  return { release: { ...release, evidence: JSON.stringify({ manifest, signature: Buffer.from(signature).toString('base64'), key: keys.publicKey, fingerprint: claudeFingerprint }) }, fingerprint: privateKey.getFingerprint().toUpperCase() };
}

it('validates a pinned-key signature before probing and when an installation is loaded again', async () => {
  const root = await temporary(), bytes = fixtureBinary('#!/bin/sh\nexit 0\n');
  const { release, fingerprint } = await signedRelease(bytes), probe = vi.fn(async () => {});
  const store = new SetupStore(join(root, 'tools'), artifactVerifier(fingerprint));
  const installed = await store.install(release, payloadNetwork(bytes), signal(), () => {}, () => true, probe);
  expect(probe).toHaveBeenCalledOnce();
  expect((await store.identity('claude'))?.hash).toBe(createHash('sha256').update(bytes).digest('hex'));
  const altered = fixtureBinary('#!/bin/sh\necho substituted\n'); await writeFile(installed.identity.path, altered);
  const recordPath = join(root, 'tools/claude/1.0.0/installed.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8')); record.identity.hash = createHash('sha256').update(altered).digest('hex');
  record.release.digest = record.identity.hash;
  await writeFile(recordPath, JSON.stringify(record));
  await expect(store.identity('claude')).rejects.toMatchObject({ code: 'signature' });
});

it('refuses a feed and record key that merely claim the pinned fingerprint', async () => {
  const root = await temporary(), bytes = fixtureBinary('#!/bin/sh\nexit 0\n'), { release } = await signedRelease(bytes);
  const store = new SetupStore(join(root, 'tools')), probe = vi.fn(async () => {});
  await expect(store.install(release, payloadNetwork(bytes), signal(), () => {}, () => true, probe)).rejects.toMatchObject({ code: 'signature' });
  expect(probe).not.toHaveBeenCalled(); expect(store.active('claude')).toBeNull();
});

it.skipIf(process.platform !== 'darwin')('rejects a forged Codex executable even when its receipt claims the pinned archive digest', async () => {
  const binary = join(await temporary(), 'codex');
  await writeFile(binary, '#!/bin/sh\necho replaced\n'); await chmod(binary, 0o700);
  const release = { ...payloadRelease(Buffer.from('ignored'), '0.166.0', 'codex'), digest: codexPin('0.166.0')!.archiveSha256 };
  await expect(artifactVerifier()(release, binary, signal())).rejects.toMatchObject({ code: 'signature' });
});

it('pins both audited Codex platforms and requires manual installation for unknown versions and unsigned providers', () => {
  for (const arch of ['arm64', 'x64'] as const) {
    const pin = codexPin('0.166.0', 'darwin', arch);
    expect(pin?.archiveSha256).toMatch(/^[a-f0-9]{64}$/); expect(pin?.binarySha256).toMatch(/^[a-f0-9]{64}$/);
  }
  expect(codexPin('0.167.0', 'darwin', 'arm64')).toBeNull();
  expect(manualInstallation('agy', null, 'darwin', 'arm64')).toBe(true);
  expect(manualInstallation('agy', null, 'win32', 'x64')).toBe(true);
  expect(manualInstallation('codex', payloadRelease(Buffer.from('untrusted'), '0.167.0', 'codex'), 'darwin', 'arm64')).toBe(true);
  expect(manualInstallation('claude', null, 'win32', 'x64')).toBe(false);
});
