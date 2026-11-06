/** Real native setup lifecycle and update-consent acceptance tests. @packageDocumentation */
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { setExecutablePins } from '../executable-pins';
import { claudeFixture, setupFixture } from './service-fixtures';
import { Owner, payloadNetwork, payloadRelease, temporaryDirectories } from './test-fixtures';
import type { CliActionId } from '../../../shared/ai-cli';
import type { AiCliSetup } from './service';
import { fixtureExecutableName } from './native-fixtures';
const temporary = temporaryDirectories();
const active: AiCliSetup[] = [];
afterEach(async () => { for (const service of active) await service.dispose(); active.length = 0; });
async function run(service: AiCliSetup, owner: Owner, actionId: CliActionId) {
  const preview = await service.preview(owner, actionId);
  expect(preview.available).toBe(true);
  const session = service.run(owner, actionId, preview.token);
  await service.sessions.owned(owner, session.id).done;
  return service.sessions.read(owner, session.id);
}
it('performs file-only discovery without consent and never launches on preview or disabled actions', async () => {
  const root = await temporary(), fixture = setupFixture(root); active.push(fixture.service);
  const binary = join(root, fixtureExecutableName('existing cli')); await writeFile(binary, fixture.payload, { mode: 0o700 }); await fixture.pins.choose('claude', binary);
  const owner = new Owner(), spawn = vi.spyOn(fixture.source, 'installable');
  expect((await fixture.service.list())[0]).toMatchObject({ consented: false, path: await realpath(binary), status: 'installed-not-signed-in', tested: false });
  for (const actionId of ['install-claude', 'status-claude', 'login-claude', 'test-claude'] as const) {
    const preview = await fixture.service.preview(owner, actionId);
    expect(preview).toMatchObject({ available: false, reason: 'not-consented' });
    expect(() => fixture.service.run(owner, actionId, preview.token)).toThrow('not-consented');
  }
  expect(spawn).not.toHaveBeenCalled();
  await expect(readFile(join(root, 'argv.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fixture.service.preview(owner, 'advanced-shell')).reason).toBe('not-consented');
});
it.skipIf(process.platform !== 'darwin')('installs, verifies real auth, signs in with one PTY, and tests through the real Claude adapter', async () => {
  const root = await temporary(), changed = vi.fn(), fixture = setupFixture(root, { changed }), { service, pins } = fixture;
  active.push(service); setExecutablePins(pins); const owner = new Owner();
  await service.consent('claude', true);
  expect(await run(service, owner, 'install-claude')).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]).toMatchObject({ version: '1.0.0', managed: true, status: 'installed-not-signed-in' });
  expect(await run(service, owner, 'status-claude')).toMatchObject({ phase: 'failed', error: 'not-signed-in' });
  const preview = await service.preview(owner, 'login-claude'), session = service.run(owner, 'login-claude', preview.token);
  await expect.poll(() => service.sessions.read(owner, session.id).output).toContain('https://auth.example.test/manual');
  service.sessions.input(owner, session.id, 'confirm\r');
  await service.sessions.owned(owner, session.id).done;
  expect(service.sessions.read(owner, session.id)).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]).toMatchObject({ status: 'ready', tested: false });
  expect(await run(service, owner, 'test-claude')).toMatchObject({ phase: 'succeeded', output: 'OK\r\nTool-free test completed.\r\n' });
  expect((await service.list())[0]).toMatchObject({ status: 'ready', tested: true });
  const calls = (await readFile(join(root, 'argv.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const testCall = calls.find(call => call.args[0] === '-p');
  expect(testCall.args).toEqual(expect.arrayContaining(['--safe-mode', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}']));
  expect(testCall.env.updates).toBe('1');
  expect(service.sessions.read(owner, session.id).output).not.toContain('PRIVATE');
  expect(changed).toHaveBeenCalled();
});
it('requires a fresh single-use plan and existing consent when an action actually starts', async () => {
  const fixture = setupFixture(await temporary()); active.push(fixture.service); const owner = new Owner();
  await fixture.service.consent('claude', true);
  const preview = await fixture.service.preview(owner, 'install-claude');
  await fixture.service.consent('claude', false);
  expect(() => fixture.service.run(owner, 'install-claude', preview.token)).toThrow('not-consented');
  expect(() => fixture.service.run(owner, 'install-claude', preview.token)).toThrow('blocked');
});

it('offers manual terminal setup before provider consent without downloading or executing a CLI', async () => {
  const root = await temporary(), fixture = setupFixture(root), { service, source, pins } = fixture;
  active.push(service); const owner = new Owner();
  const download = vi.spyOn(source, 'installable'), resolve = vi.spyOn(pins, 'resolve');
  for (const provider of ['claude', 'agy'] as const) {
    const actionId = `terminal-${provider}` as const;
    const embedded = await service.preview(owner, actionId);
    expect(embedded.available).toBe(true);
    expect(() => service.run(owner, actionId, embedded.token)).toThrow('blocked');
    const preview = await service.preview(owner, actionId);
    expect(await service.terminalPlan(owner, actionId, preview.token)).toMatchObject({ command: preview.command, cwd: join(await realpath(root), 'tools', 'actions') });
  }
  expect(download).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
  expect(service.sessions.isBusy).toBe(false);
  expect((await service.list()).every(tool => !tool.consented)).toBe(true);
  await expect(readFile(join(root, 'argv.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('checks updates only with separate consent, throttles checks, preserves cache offline, and rolls back', async () => {
  const root = await temporary(), fixture = setupFixture(root), { service, source } = fixture; active.push(service); const owner = new Owner();
  const latest = vi.spyOn(source, 'latest');
  await service.consent('claude', true); await run(service, owner, 'install-claude');
  await service.tick(); expect(latest).not.toHaveBeenCalled();
  const next = claudeFixture(root, '1.1.0'), release = payloadRelease(next, '1.1.0');
  source.installable = async () => release;
  source.latest = vi.fn(async () => release);
  source.network.download = payloadNetwork(next).download.bind(payloadNetwork(next));
  await service.checkUpdates(); expect(source.latest).toHaveBeenCalledTimes(3);
  expect(service.preferences().updateChecks).toBe(false);
  service.setPreferences({ updateChecks: true, autoUpdateWhenIdle: false, advancedShell: false });
  await service.checkUpdates(); expect(source.latest).toHaveBeenCalledTimes(3);
  expect((await service.list())[0]).toMatchObject({ latestVersion: '1.1.0', version: '1.0.0' });
  expect(await run(service, owner, 'update-claude')).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]).toMatchObject({ version: '1.1.0', previousVersion: '1.0.0', appliesToNewChats: true });
  expect(await run(service, owner, 'rollback-claude')).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]?.version).toBe('1.0.0');
});
it('rejects automatic install if a chat starts and finishes during a download', async () => {
  const root = await temporary(); let revision = 0, busy = false;
  const fixture = setupFixture(root, { chatBusy: () => busy, chatRevision: () => revision }), { service, store, source } = fixture; active.push(service); const owner = new Owner();
  await service.consent('claude', true); await run(service, owner, 'install-claude');
  const next = claudeFixture(root, '1.1.0'), release = payloadRelease(next, '1.1.0');
  store.remember(release, Date.now()); store.attempt(Date.now());
  let finish!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const download = payloadNetwork(next).download.bind(payloadNetwork(next));
  source.network.download = async (...args) => { started(); await new Promise<void>(resolve => { finish = resolve; }); return download(...args); };
  service.setPreferences({ updateChecks: true, autoUpdateWhenIdle: true, advancedShell: false });
  busy = true; await service.tick(); expect(service.sessions.isBusy).toBe(false); busy = false;
  await service.tick(); await waiting;
  revision++; busy = true; busy = false; finish();
  await expect.poll(() => service.sessions.isBusy).toBe(false);
  expect(store.active('claude')?.release.version).toBe('1.0.0');
  expect((await service.list())[0]).toMatchObject({ status: 'error', error: { code: expect.stringMatching(/busy|cancelled/) } });
});
it.skipIf(process.platform !== 'darwin')('cancels a live login when the existing provider configuration revokes consent', async () => {
  const fixture = setupFixture(await temporary()), { service, registry } = fixture; active.push(service); const owner = new Owner();
  await service.consent('claude', true); await run(service, owner, 'install-claude');
  const preview = await service.preview(owner, 'login-claude'), session = service.run(owner, 'login-claude', preview.token);
  await expect.poll(() => service.sessions.read(owner, session.id).output).toContain('https://auth.example.test/manual');
  registry.configure({ ...registry.config('claude-cli'), enabled: false });
  await expect.poll(() => service.sessions.read(owner, session.id).phase).toBe('cancelled');
  expect((await service.list())[0]?.consented).toBe(false);
});

it('keeps an existing account through manual update and rollback without requesting sign-in again', async () => {
  const root = await temporary(), fixture = setupFixture(root), { service, source, pins } = fixture;
  active.push(service); setExecutablePins(pins); const owner = new Owner();
  await service.consent('claude', true); await run(service, owner, 'install-claude');
  await writeFile(join(root, 'auth'), 'signed in');
  await run(service, owner, 'status-claude');
  const payload = claudeFixture(root, '1.1.0'), release = payloadRelease(payload, '1.1.0');
  source.installable = async () => release;
  source.network.download = payloadNetwork(payload).download.bind(payloadNetwork(payload));
  expect(await run(service, owner, 'update-claude')).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]).toMatchObject({ version: '1.1.0', status: 'ready', tested: false, appliesToNewChats: true });
  expect(await run(service, owner, 'rollback-claude')).toMatchObject({ phase: 'succeeded' });
  expect((await service.list())[0]).toMatchObject({ version: '1.0.0', status: 'ready', appliesToNewChats: true });
});
it('rejects an in-flight preview if its document reloads during release discovery', async () => {
  const fixture = setupFixture(await temporary()), { service, source } = fixture;
  active.push(service); const owner = new Owner();
  await service.consent('claude', true);
  const installable = source.installable.bind(source);
  let finish!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  source.installable = async (...args) => { started(); await new Promise<void>(resolve => { finish = resolve; }); return installable(...args); };
  const preview = service.preview(owner, 'install-claude');
  const rejected = expect(preview).rejects.toMatchObject({ code: 'cancelled' });
  await waiting; await service.resetOwner(owner); finish();
  await rejected;
});
