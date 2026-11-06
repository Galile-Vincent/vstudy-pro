/** Real Unix clients and a compiled native helper exercise the transport without Electron. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { bridgeResponseSchema, type BridgeRequest, type BridgeResponse, type McpBackend } from '../../shared/mcp';
import { createUnixBridge, type UnixBridge, type UnixBridgeOptions } from './bridge';
import { McpEngine } from './engine';

let helperDirectory: string;
export let helper: string;
const fixtures: {root: string; engine: McpEngine; bridge: UnixBridge}[] = [];
const clients: WireClient[] = [];
beforeAll(() => {
  if (process.platform==='win32') return;
  helperDirectory = mkdtempSync(join(tmpdir(), 'vmp-helper-'));
  helper = join(helperDirectory, 'mcp-peer');
  const built = spawnSync(process.execPath, [resolve('../../scripts/build-mcp-peer.mjs'), '--output', helper], {encoding: 'utf8'});
  expect({status: built.status, stderr: built.stderr}).toEqual({status: 0, stderr: ''});
});
afterAll(() => {if (helperDirectory)rmSync(helperDirectory,{recursive:true,force:true});});
afterEach(async () => {
  for (const client of clients.splice(0)) client.socket.destroy();
  for (const fixture of fixtures.splice(0)) {
    await fixture.bridge.dispose();
    fixture.engine.dispose();
    await vi.waitFor(() => expect(fixture.engine.state().activeCalls).toBe(0));
    rmSync(fixture.root, {recursive: true, force: true});
  }
});

export async function fixture(options: Partial<Omit<UnixBridgeOptions, 'userData'>> = {}, userData?: string) {
  const root = userData ?? mkdtempSync(join(tmpdir(), 'vmp-'));
  const account = {id: randomUUID(), school: 'Example school', user: 'Student'};
  const execute = vi.fn(async () => ({content: {title: 'Course'}}));
  const backend: McpBackend = {
    accounts: () => [account],
    prepare: async (_name, args) => ({accountId: args.account ?? account.id, target: 'Course', provenance: {account: account.id, school: account.school, courseId: null, moduleId: null, author: null, syncedAt: null}, execute}),
  };
  const engine = new McpEngine({userData: root, backend, limits: {spacingMs: 0, jitterMs: 0}});
  const handler = vi.fn((request: BridgeRequest, connection: string) => engine.handleRequest(request, connection));
  const bridge = await createUnixBridge({userData: root, peerHelper: helper, handleRequest: handler, onDisconnect: connection => engine.disconnect(connection), ...options});
  fixtures.push({root, engine, bridge});
  return {root, engine, bridge, account, execute, handler};
}

export function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

/** Tests deliberately bypass request validation to send malformed protocol traffic. */
export class WireClient {
  readonly socket: Socket;
  readonly connected: Promise<unknown[]>;
  readonly closed: Promise<void>;
  private bytes = Buffer.alloc(0);
  private readonly pending = new Map<string, {resolve: (value: BridgeResponse) => void; reject: (error: Error) => void}>();

  constructor(path: string) {
    this.socket = createConnection(path);
    this.connected = once(this.socket, 'connect');
    this.socket.on('error', () => {});
    this.closed = new Promise(resolve => this.socket.once('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('connection closed'));
      this.pending.clear();
      resolve();
    }));
    this.socket.on('data', chunk => {
      this.bytes = Buffer.concat([this.bytes, chunk]);
      while (this.bytes.length >= 4 && this.bytes.length >= this.bytes.readUInt32BE(0) + 4) {
        const length = this.bytes.readUInt32BE(0);
        const response = bridgeResponseSchema.parse(JSON.parse(this.bytes.subarray(4, length + 4).toString('utf8')));
        this.bytes = this.bytes.subarray(length + 4);
        const pending = this.pending.get(response.id);
        this.pending.delete(response.id);
        pending?.resolve(response);
      }
    });
    clients.push(this);
  }

  request(method: string, params: unknown, id = randomUUID(), fragmented = false): Promise<BridgeResponse> {
    const response = new Promise<BridgeResponse>((resolve, reject) => this.pending.set(id, {resolve, reject}));
    const bytes = frame({jsonrpc: '2.0', id, method, params});
    if (fragmented) for (let i = 0; i < bytes.length; i++) this.socket.write(bytes.subarray(i, i + 1));
    else this.socket.write(bytes);
    return response;
  }
}
