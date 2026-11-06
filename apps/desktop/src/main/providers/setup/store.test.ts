/** Immutable installs, live transports, rollback, and hostile archive acceptance tests. @packageDocumentation */
import { createHash } from 'node:crypto';
import { readFile, writeFile, chmod, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { SetupStore } from './store';
import { extractExecutable } from './archive';
import { ExecutablePins, setExecutablePins, pinnedCli } from '../executable-pins';
import { executableLeased } from './leases';
import { runCli } from '../cli-transport';
import { payloadNetwork, payloadRelease, tarPayload, temporaryDirectories } from './test-fixtures';
const temporary = temporaryDirectories();
const signal = () => AbortSignal.timeout(5000);
it('switches new sessions while a real old transport remains leased and can roll back', async () => {
  const directory = await temporary(), store = new SetupStore(join(directory, 'tools'));
  const script = (label: string) => Buffer.from(`#!/bin/sh\nprintf '%s\\n' '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"${label}"}}}'\nwhile :; do /bin/sleep 1; done\n`);
  const old = script('old'), next = script('new');
  const first = await store.install(payloadRelease(old), payloadNetwork(old), signal(), () => {});
  const confirm = vi.fn(async () => false), pins = new ExecutablePins(join(directory, 'pins.json'), confirm);
  pins.setManagedResolver(binary => store.identity(binary)); pins.activateManaged('claude'); setExecutablePins(pins);
  const stream = runCli(first.identity.path, [], '', directory, 'claude', new AbortController().signal);
  let newStream: ReturnType<typeof runCli> | undefined;
  try {
    expect((await stream.next()).value).toMatchObject({ type: 'text-delta', text: 'old' });
    expect(executableLeased(first.identity.path)).toBe(true);
    const second = await store.install(payloadRelease(next, '1.1.0'), payloadNetwork(next), signal(), () => {});
    expect(second.previous).toBe('1.0.0');
    expect(await pinnedCli('claude')).toBe(second.identity.path);
    expect(await readFile(first.identity.path)).toEqual(old);
    expect(executableLeased(first.identity.path)).toBe(true);
    newStream = runCli((await pinnedCli('claude'))!, [], '', directory, 'claude', new AbortController().signal);
    expect((await newStream.next()).value).toMatchObject({ type: 'text-delta', text: 'new' });
    expect(confirm).not.toHaveBeenCalled();
    const restored = await store.rollback('claude'); expect(restored.release.version).toBe('1.0.0');
    expect(await pinnedCli('claude')).toBe(first.identity.path);
    expect(JSON.parse(await readFile(join(directory, 'tools/claude/1.1.0/installed.json'), 'utf8'))).toMatchObject({ release: { version: '1.1.0', digest: createHash('sha256').update(next).digest('hex') } });
  } finally { await stream.return(undefined); await newStream?.return(undefined); }
  expect(executableLeased(first.identity.path)).toBe(false);
});
it('still requires existing changed-file confirmation for the active managed path', async () => {
  const directory = await temporary(), store = new SetupStore(join(directory, 'tools')), bytes = Buffer.from('#!/bin/sh\nexit 0\n');
  const installed = await store.install(payloadRelease(bytes), payloadNetwork(bytes), signal(), () => {});
  const confirm = vi.fn(async () => false), pins = new ExecutablePins(join(directory, 'pins.json'), confirm);
  await pins.choose('claude', installed.identity.path); pins.setManagedResolver(binary => store.identity(binary));
  await writeFile(installed.identity.path, '#!/bin/sh\nexit 1\n');
  expect(await pins.resolve('claude')).toBeNull(); expect(confirm).toHaveBeenCalledTimes(1);
});
it('never publishes failed verification, version validation, or a new busy activation', async () => {
  const directory = await temporary(), store = new SetupStore(join(directory, 'tools')), bytes = Buffer.from('#!/bin/sh\nexit 0\n');
  const release = payloadRelease(bytes);
  await expect(store.install({ ...release, digest: '0'.repeat(64) }, payloadNetwork(bytes), signal(), () => {})).rejects.toMatchObject({ code: 'checksum' });
  expect(store.active('claude')).toBeNull();
  await expect(store.install(release, payloadNetwork(bytes), signal(), () => {}, () => true, async () => { throw new Error('wrong version'); })).rejects.toThrow('wrong version');
  await expect(store.install(release, payloadNetwork(bytes), signal(), () => {}, () => true, async binary => { await writeFile(binary, '#!/bin/sh\nexit 2\n'); })).rejects.toMatchObject({ code: 'checksum' });
  await expect(store.install(release, payloadNetwork(bytes), signal(), () => {}, () => false)).rejects.toMatchObject({ code: 'busy' });
  expect(store.active('claude')).toBeNull(); expect(await readdir(join(directory, 'tools/claude'))).toEqual([]);
});
it('persists default-off update consent and the check throttle separately from providers', async () => {
  const root = join(await temporary(), 'tools'), store = new SetupStore(root);
  expect(store.preferences).toEqual({ updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false });
  store.attempt(1234); store.remember(payloadRelease(Buffer.from('native')), 1234);
  store.setPreferences({ updateChecks: true, autoUpdateWhenIdle: false, advancedShell: false });
  const restarted = new SetupStore(root);
  expect(restarted.lastAttempt).toBe(1234); expect(restarted.checkedAt('claude')).toBe(1234);
  expect(restarted.cached('claude')?.version).toBe('1.0.0'); expect(restarted.preferences.updateChecks).toBe(true);
});
it.each(['../escape', '/absolute', 'sub/../../escape', 'antigravity/../../escape'])('rejects tar path %s', async name => {
  const directory = await temporary(), archive = join(directory, 'payload'); await writeFile(archive, tarPayload(name, Buffer.from('native')));
  await expect(extractExecutable(archive, join(directory, 'out'), 'antigravity', signal())).rejects.toMatchObject({ code: 'blocked' });
});
it.each(['1', '2', '5', 'x'])('rejects non-regular tar type %s', async type => {
  const directory = await temporary(), archive = join(directory, 'payload'); await writeFile(archive, tarPayload('antigravity', Buffer.from('native'), type));
  await expect(extractExecutable(archive, join(directory, 'out'), 'antigravity', signal())).rejects.toMatchObject({ code: 'blocked' });
});
it('extracts only the expected regular executable and preserves its verified bytes', async () => {
  const directory = await temporary(), bytes = Buffer.from('#!/bin/sh\nexit 0\n'), archive = tarPayload('antigravity', bytes);
  const store = new SetupStore(join(directory, 'tools'));
  const result = await store.install({ ...payloadRelease(archive, '1.0.0', 'agy'), archive: 'tar.gz', executable: 'antigravity' }, payloadNetwork(archive), signal(), () => {});
  expect(await readFile(result.identity.path)).toEqual(bytes);
  await chmod(result.identity.path, 0o700);
});
it.each([false, true])('keeps a newly activated executable when an old pending check resolves with %s', async approved => {
  const directory = await temporary(), store = new SetupStore(join(directory, 'tools')), bytes = Buffer.from('#!/bin/sh\nexit 0\n');
  const first = await store.install(payloadRelease(bytes), payloadNetwork(bytes), signal(), () => {});
  let approve!: (allowed: boolean) => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const pins = new ExecutablePins(join(directory, 'pins.json'), () => { started(); return new Promise<boolean>(resolve => { approve = resolve; }); });
  pins.setManagedResolver(binary => store.identity(binary)); pins.activateManaged('claude');
  await writeFile(first.identity.path, '#!/bin/sh\nexit 1\n');
  const oldResolution = pins.resolve('claude'); await waiting;
  const second = await store.install(payloadRelease(bytes, '1.1.0'), payloadNetwork(bytes), signal(), () => {});
  pins.activateManaged('claude');
  try { expect(await pins.resolve('claude')).toBe(second.identity.path); }
  finally { approve(approved); await oldResolution; }
  expect(await pins.resolve('claude')).toBe(second.identity.path);
});
