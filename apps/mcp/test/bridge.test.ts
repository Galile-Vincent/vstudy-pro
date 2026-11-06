/** Verify framed transport failure modes, private grants, and missing-app recovery. @packageDocumentation */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BridgeClient, pingBridge } from '../src/bridge';
import { Credentials } from '../src/credentials';
import { credentialPath } from '../src/paths';
import { Frames, encodeFrame } from '../src/framing';
import { Wire } from '../src/transport';
import { MCP_MAX_FRAME } from '../src/contract';
import { fixture, grant } from './fixture';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function root() {
  const path = mkdtempSync('/private/tmp/vmc-');
  cleanups.push(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

async function setup(options: Parameters<typeof fixture>[0] = {}) {
  const app = await fixture(options);
  cleanups.push(app.close);
  const credentials = new Credentials(credentialPath('codex', app.home));
  const client = new BridgeClient({ socketPath: app.socketPath, credentials, clientName: 'Test client', stderr: () => {}, backoffMs: [0] });
  cleanups.push(() => client.close());
  return { app, credentials, client };
}

describe('bridge boundary', () => {
  it('decodes fragmented and concatenated frames and rejects invalid lengths and UTF-8', () => {
    const first = encodeFrame({ a: 'Taipei 台北' });
    const second = encodeFrame({ b: 2 });
    const frames = new Frames();
    expect(frames.push(first.subarray(0, 2))).toEqual([]);
    expect(frames.push(first.subarray(2, 9))).toEqual([]);
    expect(frames.push(Buffer.concat([first.subarray(9), second]))).toEqual([{ a: 'Taipei 台北' }, { b: 2 }]);
    for (const size of [0, MCP_MAX_FRAME + 1, 0xffffffff]) {
      const header = Buffer.alloc(4); header.writeUInt32BE(size);
      expect(() => new Frames().push(header)).toThrow();
    }
    expect(() => new Frames().push(Buffer.from([0, 0, 0, 1, 255]))).toThrow();
    expect(() => encodeFrame('x'.repeat(MCP_MAX_FRAME))).toThrow();
  });

  it('diagnostic ping never pairs', async () => {
    const { app } = await setup();
    expect(await pingBridge(app.socketPath)).toBe(1);
    expect(app.calls.map(call => call.method)).toEqual(['ping']);
    expect(existsSync(join(app.home, '.config'))).toBe(false);
  });

  it('rejects insecure socket and directory permissions', async () => {
    const { app, client } = await setup();
    chmodSync(app.socketPath, 0o666);
    expect(await client.call('list_accounts', {})).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    chmodSync(app.socketPath, 0o600);
    chmodSync(join(app.userData, 'mcp'), 0o755);
    expect(await client.call('list_accounts', {})).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(app.calls).toEqual([]);
  });

  it('refuses a symlinked socket before sending credentials', async () => {
    const { app } = await setup();
    const alias = join(app.userData, 'mcp/alias.sock');
    symlinkSync(app.socketPath, alias);
    const client = new BridgeClient({ socketPath: alias, credentials: new Credentials(credentialPath('generic', app.home)), clientName: 'Test', stderr: () => {} });
    expect((await client.call('list_accounts', {})).ok).toBe(false);
    expect(app.calls).toEqual([]);
  });

  it('requires private grant files and directories, and rejects their symlinks', () => {
    const home = root();
    const path = credentialPath('codex', home);
    const credentials = new Credentials(path);
    const original = credentials.identity();
    expect(credentials.identity().clientId).toBe(original.clientId);
    chmodSync(path, 0o644);
    expect(() => credentials.read()).toThrow();
    chmodSync(path, 0o600);
    chmodSync(join(path, '..'), 0o755);
    expect(() => credentials.identity()).toThrow();
    chmodSync(join(path, '..'), 0o700);
    const target = join(home, 'target');
    writeFileSync(target, '{}', { mode: 0o600 });
    const alias = join(home, '.config/vstudy-mcp/claude.json');
    symlinkSync(target, alias);
    expect(() => new Credentials(alias).identity()).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('{}');
  });

  it('rejects expired grants without repairing identity or retrying pairing', async () => {
    const { app, client, credentials } = await setup();
    const identity = credentials.identity();
    credentials.save({ ...identity, grant, expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(await client.call('list_accounts', {})).toMatchObject({ ok: false, error: { code: 'EXPIRED' } });
    expect(app.calls).toEqual([]);
    expect(credentials.read()?.clientId).toBe(identity.clientId);
  });

  it('grants and identities are separate per configured client, not by a reported name', async () => {
    const { app, client, credentials } = await setup();
    await client.call('list_accounts', {});
    const otherCredentials = new Credentials(credentialPath('claude', app.home));
    const other = new BridgeClient({ socketPath: app.socketPath, credentials: otherCredentials, clientName: 'Test client', stderr: () => {} });
    cleanups.push(() => other.close());
    await other.call('list_accounts', {});
    expect(otherCredentials.read()?.clientId).not.toBe(credentials.read()?.clientId);
    expect(app.calls.filter(call => call.method === 'pair.begin')).toHaveLength(2);
  });

  it('shares one pairing among concurrent calls', async () => {
    const { app, client } = await setup({ callDelayMs: 20 });
    expect((await Promise.all(Array.from({ length: 8 }, () => client.call('list_accounts', {})))).every(result => result.ok)).toBe(true);
    expect(app.calls.filter(call => call.method === 'pair.begin')).toHaveLength(1);
    expect(app.connections).toBe(1);
    expect(app.peakActive).toBe(4);
  });

  it('starts a missing app once and backs off without replaying a write', async () => {
    const directory = root();
    const launch = vi.fn(async () => {});
    const client = new BridgeClient({ socketPath: join(directory, 'mcp/bridge.sock'), credentials: new Credentials(join(directory, 'grant.json')),
      clientName: 'Test', stderr: () => {}, launch, backoffMs: [0, 1, 1] });
    cleanups.push(() => client.close());
    expect(await client.call('list_accounts', {})).toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(existsSync(join(directory, 'grant.json'))).toBe(false);
  });

  it('allows the 60-second consent window and then bounds the roundtrip', async () => {
    const { app } = await setup({ silent: true });
    const wire = await Wire.connect(app.socketPath);
    cleanups.push(() => wire.close());
    vi.useFakeTimers();
    let settled = false;
    const request = wire.rpc({ method: 'pair.finish', params: { pairingId: '50000000-0000-4000-8000-000000000005' } });
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    void request.then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(wire.closed).toBe(true);
  });

  it('closes pending consent immediately rather than waiting for its 60-second deadline', async () => {
    const { app, client } = await setup({ silentFinish: true });
    const request = client.call('create_task', { task: { title: 'Own task', courseId: null, dueAt: null, estimateMinutes: 25 } });
    await vi.waitFor(() => expect(app.calls.some(call => call.method === 'pair.finish')).toBe(true));
    let closed = false;
    const closing = client.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 25));
    const closedBeforePeerDropped = closed;
    app.dropConnections();
    await closing;
    expect((await request).ok).toBe(false);
    expect(closedBeforePeerDropped).toBe(true);
  });

  it('cancels a pending-consent poll without finishing on a new connection', async () => {
    const { app, client } = await setup({ pendingFinishes: Infinity });
    const request = client.call('create_task', { task: { title: 'Own task', courseId: null, dueAt: null, estimateMinutes: 25 } });
    await vi.waitFor(() => expect(app.calls.some(call => call.method === 'pair.finish')).toBe(true));
    await client.close();
    expect(await request).toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } });
    expect(app.connections).toBe(1);
    expect(app.calls.filter(call => call.method === 'pair.finish')).toHaveLength(1);
  });

  it('rejects a grant containing school secrets or unrecognized fields', () => {
    const directory = root();
    mkdirSync(join(directory, 'private'), { mode: 0o700 });
    const path = join(directory, 'private/codex.json');
    writeFileSync(path, JSON.stringify({ clientId: '50000000-0000-4000-8000-000000000005', token: 'school-secret' }), { mode: 0o600 });
    expect(() => new Credentials(path).read()).toThrow();
  });
});
