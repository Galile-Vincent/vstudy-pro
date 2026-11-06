/** Negative regressions adapted from the independent scratch reproductions; all payloads are local fakes. @packageDocumentation */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { SetupStore } from './store';
import { VendorNetwork } from './network';
import { ReleaseSource } from './releases';
import { probeVersion } from './probes';
import { ExecutablePins } from '../executable-pins';
import { executableIdentity } from '../trusted-executable';
import { claudeFixture, setupFixture } from './service-fixtures';
import { Owner, payloadNetwork, payloadRelease, tarPayload, temporaryDirectories } from './test-fixtures';

const temporary = temporaryDirectories();
const signal = () => AbortSignal.timeout(5000);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const program = (marker: string, version: string) => Buffer.from(`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'owned');console.log(${JSON.stringify(version)});\n`);

it.skipIf(process.platform === 'win32')('never probes bytes authenticated only by a compromised Antigravity feed', async () => {
  const root = await temporary(), marker = join(root, 'FEED_CODE_EXECUTED');
  const bytes = program(marker, '9.9.9'), archive = tarPayload('antigravity', bytes);
  const manifest = { version: '9.9.9', url: 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/evil.tar.gz', sha512: createHash('sha512').update(archive).digest('hex') };
  const network = new VendorNetwork(async input => String(input).includes('/manifests/') ? Response.json(manifest) : new Response(new Uint8Array(archive)));
  const source = new ReleaseSource(network, 'darwin', 'arm64'), store = new SetupStore(join(root, 'tools'));
  const probe = vi.fn((file: string, version: string) => probeVersion(file, 'agy', version, root, signal()).then(() => {}));
  await expect((async () => {
    const release = await source.installable('agy', signal());
    return store.install(release, network, signal(), () => {}, () => true, probe);
  })()).rejects.toMatchObject({ code: 'manual-install-required' });
  expect(probe).not.toHaveBeenCalled();
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(store.active('agy')).toBeNull();
});

it.skipIf(process.platform === 'win32')('refuses feed-substituted Codex bytes under the audited version before probing', async () => {
  const root = await temporary(), marker = join(root, 'CODEX_FEED_CODE_EXECUTED');
  const archive = tarPayload('codex-aarch64-apple-darwin', program(marker, '0.166.0'));
  const url = 'https://api.github.com/repos/openai/codex/payload.tar.gz';
  const metadata = { tag_name: 'rust-v0.166.0', html_url: 'https://github.com/openai/codex/releases/tag/rust-v0.166.0', assets: [{ name: 'codex-aarch64-apple-darwin.tar.gz', browser_download_url: url, digest: 'sha256:' + hash(archive), size: archive.length }] };
  const network = new VendorNetwork(async input => String(input) === url ? new Response(new Uint8Array(archive)) : Response.json(metadata));
  const source = new ReleaseSource(network, 'darwin', 'arm64'), store = new SetupStore(join(root, 'tools'));
  const probe = vi.fn((file: string, version: string) => probeVersion(file, 'codex', version, root, signal()).then(() => {}));
  await expect((async () => {
    const release = await source.installable('codex', signal());
    return store.install(release, network, signal(), () => {}, () => true, probe);
  })()).rejects.toMatchObject({ code: 'signature' });
  expect(probe).not.toHaveBeenCalled();
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(store.active('codex')).toBeNull();
});

it.skipIf(process.platform !== 'darwin')('the store independently rejects a forged feed release even if callers skip ReleaseSource', async () => {
  const root = await temporary(), marker = join(root, 'DIRECT_STORE_EXECUTION'), bytes = program(marker, '0.166.0');
  const store = new SetupStore(join(root, 'tools')), probe = vi.fn(async (file: string, version: string) => { await probeVersion(file, 'codex', version, root, signal()); });
  const release = { ...payloadRelease(bytes, '0.166.0', 'codex'), url: 'https://api.github.com/repos/openai/codex/payload' };
  await expect(store.install(release, payloadNetwork(bytes), signal(), () => {}, () => true, probe)).rejects.toMatchObject({ code: 'signature' });
  expect(probe).not.toHaveBeenCalled();
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readdir(join(store.root, 'codex'))).toEqual([]);
});

it.each(['both', 'automatic', 'checks', 'provider', 'regrant'] as const)('cancels a paused automatic update after revoking %s consent', async revoke => {
  const root = await temporary(), { service, source, store, registry } = setupFixture(root), owner = new Owner();
  let finish!: () => void;
  try {
    await service.consent('claude', true);
    const preview = await service.preview(owner, 'install-claude');
    const installed = service.run(owner, 'install-claude', preview.token);
    await service.sessions.owned(owner, installed.id).done;
    const marker = join(root, 'AUTOMATIC_PROBE_EXECUTED');
    const next = Buffer.from(claudeFixture(root, '1.1.0').toString().replace("const fs=require('fs');", `const fs=require('fs');fs.writeFileSync(${JSON.stringify(marker)},'executed');`));
    const release = payloadRelease(next, '1.1.0');
    store.remember(release, Date.now()); store.attempt(Date.now());
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const network = payloadNetwork(next);
    source.network.download = async (...args) => { started(); await gate; return network.download(...args); };
    service.setPreferences({ updateChecks: true, autoUpdateWhenIdle: true, advancedShell: false });
    await service.tick(); await waiting;
    if (revoke === 'provider') registry.configure({ ...registry.config('claude-cli'), enabled: false });
    else if (revoke === 'checks') store.setPreferences({ updateChecks: false, autoUpdateWhenIdle: true, advancedShell: false });
    else service.setPreferences({ updateChecks: revoke === 'automatic', autoUpdateWhenIdle: false, advancedShell: false });
    if (revoke === 'regrant') service.setPreferences({ updateChecks: true, autoUpdateWhenIdle: true, advancedShell: false });
    finish();
    await expect.poll(() => service.sessions.isBusy).toBe(false);
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(store.active('claude')?.release.version).toBe('1.0.0');
    expect(await readdir(join(store.root, 'claude'))).toEqual(['1.0.0', 'active.json']);
  } finally { finish?.(); await service.dispose(); vi.restoreAllMocks(); }
});

async function forgedRecord() {
  const root = await temporary(), bytes = Buffer.from('#!/bin/sh\nexit 0\n');
  const allowed = new Map([['1.0.0', hash(bytes)]]);
  const store = new SetupStore(join(root, 'tools'), async (release, binary) => {
    if (allowed.get(release.version) !== (await executableIdentity(binary)).hash) throw new Error('Unauthenticated record');
  });
  const installed = await store.install(payloadRelease(bytes), payloadNetwork(bytes), signal(), () => {});
  const confirm = vi.fn(async () => false), file = join(root, 'pins.json'), pins = new ExecutablePins(file, confirm);
  pins.setManagedResolver(binary => store.identity(binary), binary => store.describe(binary));
  pins.activateManaged('claude', installed.identity);
  const originalPins = await readFile(file, 'utf8');
  const folder = join(store.root, 'claude', '9.9.9'), binary = join(folder, 'claude');
  await mkdir(folder, { mode: 0o700 }); await writeFile(binary, '#!/bin/sh\necho malicious\n', { mode: 0o700 });
  const identity = await executableIdentity(binary);
  await writeFile(join(folder, 'installed.json'), JSON.stringify({ release: payloadRelease(bytes, '9.9.9'), identity, completedAt: Date.now() }));
  await writeFile(join(store.root, 'claude', 'active.json'), JSON.stringify({ current: '9.9.9', previous: '1.0.0' }));
  return { store, pins, confirm, binary, file, originalPins, installed };
}

it('keeps the approved pin as the expected identity when installation records and pointers are forged', async () => {
  const { pins, confirm, binary, file, originalPins, installed } = await forgedRecord();
  expect(await readFile(file, 'utf8')).toBe(originalPins);
  expect(await pins.resolve('claude')).toBeNull();
  expect(confirm).toHaveBeenCalledWith(installed.identity, expect.objectContaining({ path: binary }));
  expect(await readFile(file, 'utf8')).toBe(originalPins);
});

it('re-authenticates a managed installation record when it is loaded, independently of its JSON hash', async () => {
  const { store, pins, confirm, file, originalPins } = await forgedRecord();
  await expect(Promise.resolve().then(() => store.identity('claude'))).rejects.toThrow();
  confirm.mockResolvedValue(true);
  await expect(pins.resolve('claude')).rejects.toThrow();
  expect(await readFile(file, 'utf8')).toBe(originalPins);
});
