/** The compiled UID helper and real Unix sockets enforce the actual transport boundary. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { defaultScopes, pairBeginResultSchema, pairFinishResultSchema } from '../../shared/mcp';
import { createUnixBridge } from './bridge';
import { fixture, frame, helper, WireClient } from './bridge-test-fixture';
import { peerUid } from './peer';

const unixIt = it.skipIf(process.platform === 'win32');

unixIt('verifies the real accepted socket UID through fd 3 before serving even a ping', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let uid: number | undefined;
  const verify = vi.fn(async (socket, executable) => { await gate; uid = await peerUid(socket, executable); return uid; });
  const {bridge, handler, root} = await fixture({verifyPeer: verify});
  expect(statSync(join(root, 'mcp')).mode & 0o777).toBe(0o700);
  expect(statSync(bridge.socketPath).mode & 0o777).toBe(0o600);
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  const response = client.request('ping', {}, randomUUID(), true);
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
  expect(handler).not.toHaveBeenCalled();
  release();
  expect(await response).toMatchObject({result: {version: 1, enabled: false}});
  expect(uid).toBe(process.getuid?.());
  expect(handler).toHaveBeenCalledTimes(1);
  const withoutSocket = spawnSync(helper, [], {encoding: 'utf8'});
  expect(withoutSocket.status).toBe(1);
  expect(withoutSocket.stdout).toBe('');
});

unixIt('serves concurrent clients and multiple coalesced requests with independent connection IDs', async () => {
  const {bridge, handler} = await fixture();
  const a = new WireClient(bridge.socketPath);
  const b = new WireClient(bridge.socketPath);
  await Promise.all([a.connected, b.connected]);
  const responses = await Promise.all([a.request('ping', {}), b.request('ping', {}), a.request('ping', {}), b.request('ping', {})]);
  expect(responses.every(response => response.result !== undefined)).toBe(true);
  expect(new Set(handler.mock.calls.map(call => call[1])).size).toBe(2);
});

unixIt('keeps pairing socket-bound across real connections and rejects replay or scope escape', async () => {
  const {bridge, engine, account, execute} = await fixture();
  engine.setEnabled(true);
  const a = new WireClient(bridge.socketPath);
  const b = new WireClient(bridge.socketPath);
  await Promise.all([a.connected, b.connected]);
  const begin = pairBeginResultSchema.parse((await a.request('pair.begin', {clientId: randomUUID(), clientName: 'Codex', scopes: defaultScopes})).result);
  engine.decidePairing({pairingId: begin.pairingId, approve: true, scopes: defaultScopes, accountIds: [account.id]});
  expect(await b.request('pair.finish', {pairingId: begin.pairingId})).toMatchObject({error: {data: {code: 'DENIED'}}});
  const grant = pairFinishResultSchema.parse((await a.request('pair.finish', {pairingId: begin.pairingId})).result);
  expect(await a.request('pair.finish', {pairingId: begin.pairingId})).toMatchObject({error: {data: {code: 'DENIED'}}});
  expect(await b.request('tools.call', {grant: grant.grant, name: 'get_grades', args: {courseId: randomUUID()}})).toMatchObject({result: {ok: false, error: {code: 'SCOPE_REQUIRED'}}});
  expect(execute).not.toHaveBeenCalled();
  expect(await b.request('tools.call', {grant: grant.grant, name: 'list_courses', args: {}})).toMatchObject({result: {ok: true}});
});

unixIt('disconnect cancels pending consent and the engine can reconnect after a bridge restart', async () => {
  const {bridge, engine, root, account} = await fixture();
  engine.setEnabled(true);
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  const begin = pairBeginResultSchema.parse((await client.request('pair.begin', {clientId: randomUUID(), clientName: 'Agent', scopes: defaultScopes})).result);
  client.socket.destroy();
  await vi.waitFor(() => expect(engine.state().pairings).toEqual([]));
  expect(() => engine.decidePairing({pairingId: begin.pairingId, approve: true, scopes: defaultScopes, accountIds: [account.id]})).toThrow('NOT_FOUND');
  await bridge.dispose();
  expect(existsSync(bridge.socketPath)).toBe(false);
  const restarted = await createUnixBridge({userData: root, peerHelper: helper, handleRequest: (request, connection) => engine.handleRequest(request, connection), onDisconnect: connection => engine.disconnect(connection)});
  try {
    const next = new WireClient(restarted.socketPath);
    await next.connected;
    expect(await next.request('ping', {})).toMatchObject({result: {enabled: true}});
  } finally { await restarted.dispose(); }
});

unixIt('revoking a grant cancels a write awaiting renderer approval over the real socket', async () => {
  const {bridge, engine, account, execute} = await fixture();
  engine.setEnabled(true);
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  const begin = pairBeginResultSchema.parse((await client.request('pair.begin', {clientId: randomUUID(), clientName: 'Agent', scopes: ['write:local']})).result);
  engine.decidePairing({pairingId: begin.pairingId, approve: true, scopes: ['write:local'], accountIds: [account.id]});
  const grant = pairFinishResultSchema.parse((await client.request('pair.finish', {pairingId: begin.pairingId})).result);
  const result = client.request('tools.call', {grant: grant.grant, name: 'create_task', args: {task: {title: 'Read', courseId: null, dueAt: null, estimateMinutes: 30}}});
  await vi.waitFor(() => expect(engine.state().proposals).toHaveLength(1));
  engine.revoke(grant.grantInfo.id);
  expect(await result).toMatchObject({result: {ok: false, error: {code: 'DENIED'}}});
  expect(execute).not.toHaveBeenCalled();
  expect(engine.state().proposals).toEqual([]);
});

unixIt('refuses to replace a live listener and leaves the original socket usable', async () => {
  const {bridge, root} = await fixture();
  await expect(createUnixBridge({userData: root, peerHelper: helper, handleRequest: async request => ({jsonrpc: '2.0', id: request.id, result: {}}), onDisconnect: () => {}})).rejects.toThrow();
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  expect(await client.request('ping', {})).toMatchObject({result: {version: 1}});
});

unixIt('recovers a stale socket and PID lock left by a killed listener', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vmp-'));
  mkdirSync(join(root, 'mcp'), {mode: 0o700});
  const path = join(root, 'mcp/bridge.sock');
  const lock = join(root, 'mcp/bridge.lock');
  const child = spawn(process.execPath, ['-e', `
    const net = require('node:net'), fs = require('node:fs');
    fs.writeFileSync(process.argv[2], process.pid + '\\n', {mode: 0o600});
    net.createServer().listen(process.argv[1], () => { fs.chmodSync(process.argv[1], 0o600); process.send('ready'); });
  `, path, lock], {stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  try { await once(child, 'message'); }
  finally { child.kill('SIGKILL'); await once(child, 'exit'); }
  expect(existsSync(path)).toBe(true);
  chmodSync(path, 0o600);
  const {bridge} = await fixture({}, root);
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  expect(await client.request('ping', {})).toMatchObject({result: {version: 1}});
});

unixIt('closes duplicate in-flight request IDs without executing a second handler', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const handler = vi.fn(async request => { await gate; return {jsonrpc: '2.0' as const, id: request.id, result: {}}; });
  const {bridge} = await fixture({handleRequest: handler});
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  const bytes = frame({jsonrpc: '2.0', id: 'same', method: 'ping', params: {}});
  client.socket.write(bytes);
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  client.socket.write(bytes);
  await client.closed;
  finish();
  expect(handler).toHaveBeenCalledTimes(1);
});
