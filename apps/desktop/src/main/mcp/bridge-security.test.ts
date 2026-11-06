/** Transport failures deny access before any agent request reaches main services. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createUnixBridge } from './bridge';
import { fixture, frame, helper, WireClient } from './bridge-test-fixture';

const unixIt = it.skipIf(process.platform === 'win32');

unixIt.each(['wrong-uid', 'missing-helper', 'failed-verifier'] as const)('%s fails closed before request handling', async kind => {
  const options = kind === 'wrong-uid' ? {verifyPeer: async () => process.getuid!() + 1} : kind === 'missing-helper' ? {peerHelper: '/nonexistent/vstudy-mcp-peer'} : {verifyPeer: async () => { throw new Error('private exception'); }};
  const {bridge, handler} = await fixture(options);
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  client.socket.write(frame({jsonrpc: '2.0', id: '1', method: 'ping', params: {}}));
  await client.closed;
  expect(handler).not.toHaveBeenCalled();
});

unixIt.each([
  Buffer.from([0, 0, 0, 0]),
  Buffer.from([0, 16, 0, 1]),
  Buffer.from([0, 0, 0, 1, 0xff]),
  Buffer.from([0, 0, 0, 1, 0x7b]),
  frame({jsonrpc: '2.0', id: '1', method: 'proposal.approve', params: {}}),
  frame({jsonrpc: '2.0', id: '1', method: 'ping', params: {}, extra: true}),
])('closes malformed or excessive frames without invoking the handler', async bytes => {
  const {bridge, handler} = await fixture();
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  client.socket.write(bytes);
  await client.closed;
  expect(handler).not.toHaveBeenCalled();
});

unixIt('bounds incomplete frames by idle timeout', async () => {
  const {bridge, handler} = await fixture({idleMs: 100});
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  client.socket.write(Buffer.from([0, 0]));
  await client.closed;
  expect(handler).not.toHaveBeenCalled();
});

unixIt('bounds request duration, per-connection concurrency, and total connections', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const handler = vi.fn(async request => { await gate; return {jsonrpc: '2.0' as const, id: request.id, result: {}}; });
  const {bridge} = await fixture({handleRequest: handler, requestTimeoutMs: 100, maxConnections: 1, maxPerConnection: 1});
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  client.socket.write(frame({jsonrpc: '2.0', id: 'first', method: 'ping', params: {}}));
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  const extra = new WireClient(bridge.socketPath);
  await extra.connected;
  await extra.closed;
  client.socket.write(frame({jsonrpc: '2.0', id: 'second', method: 'ping', params: {}}));
  await client.closed;
  finish();
  expect(handler).toHaveBeenCalledTimes(1);
});

unixIt('times out a request whose handler does not settle', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const {bridge} = await fixture({requestTimeoutMs: 100, handleRequest: async request => { await gate; return {jsonrpc: '2.0', id: request.id, result: {}}; }});
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  client.socket.write(frame({jsonrpc: '2.0', id: 'first', method: 'ping', params: {}}));
  await client.closed;
  finish();
});

unixIt('rejects symlinked socket paths and lock files without following or deleting their targets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vmp-'));
  const external = join(root, 'external');
  const options = {userData: root, peerHelper: helper, handleRequest: async () => ({jsonrpc: '2.0' as const, id: randomUUID(), result: {}}), onDisconnect: () => {}};
  mkdirSync(join(root, 'mcp'), {mode: 0o700});
  writeFileSync(external, 'untouched');
  try {
    symlinkSync(external, join(root, 'mcp/bridge.sock'));
    await expect(createUnixBridge(options)).rejects.toThrow('DENIED');
    expect(existsSync(external)).toBe(true);
    rmSync(join(root, 'mcp/bridge.sock'));
    symlinkSync(external, join(root, 'mcp/bridge.lock'));
    await expect(createUnixBridge(options)).rejects.toThrow('DENIED');
    expect(existsSync(external)).toBe(true);
  } finally { rmSync(root, {recursive: true, force: true}); }
});

unixIt('returns fixed errors when a handler fails and rejects oversized responses', async () => {
  const {bridge} = await fixture({handleRequest: async () => { throw new Error('SCHOOL-TOKEN-CANARY https://school.example'); }});
  const client = new WireClient(bridge.socketPath);
  await client.connected;
  const result = await client.request('ping', {});
  expect(result).toMatchObject({error: {data: {code: 'INTERNAL'}}});
  expect(JSON.stringify(result)).not.toContain('CANARY');
  const large = await fixture({handleRequest: async request => ({jsonrpc: '2.0', id: request.id, result: 'a'.repeat(1024 * 1024)})});
  const attacker = new WireClient(large.bridge.socketPath);
  await attacker.connected;
  await expect(attacker.request('ping', {})).rejects.toThrow('connection closed');
});
