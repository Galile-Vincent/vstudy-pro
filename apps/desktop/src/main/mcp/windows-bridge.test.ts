/** Exercise the shared engine through the production Windows SDK connector and native ACL host. */
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { Wire } from '../../../../mcp/src/transport';
import { connectLocalSocket } from '../../../../mcp/src/connection';
import { Frames, encodeFrame } from '../../../../mcp/src/framing';
import { MCP_MAX_FRAME, pairBeginResultSchema, pairFinishResultSchema } from '../../shared/mcp';
import { createMcpEngine } from './engine';
import { createWindowsBridge } from './windows-bridge';
import { createWindowsStatePersistence } from './windows-state';

vi.mock('electron', () => ({app: {isPackaged: false}}));

it.skipIf(process.platform === 'win32')('rejects Windows host startup on an unsupported kernel', async () => {
  await expect(createWindowsBridge({userData: '/fixture', handleRequest: vi.fn(), onDisconnect: vi.fn()})).rejects.toMatchObject({code: 'UNSUPPORTED'});
});

function disconnected(stream: Duplex): Promise<void> {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Invalid frame did not close the authenticated connection.')), 15_000);
    const done = () => {clearTimeout(timer); accept();};
    stream.once('end', done); stream.once('close', done); stream.once('error', done);
    stream.resume();
  });
}

it.skipIf(process.platform !== 'win32')('pairs and reads through the authenticated client, persists private state, and rejects oversized frames before dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-pipe-engine-'));
  const account = {id: randomUUID(), school: '學校', user: 'Student'};
  const persistence = createWindowsStatePersistence({script: resolve('resources/mcp/windows-state.ps1')});
  const execute = vi.fn(async () => ({content: {title: '課程 日本語'}}));
  const engine = createMcpEngine({userData: root, persistence, limits: {spacingMs: 0, jitterMs: 0}, backend: {
    accounts: () => [account], prepare: async () => ({accountId: account.id, target: '課程',
      provenance: {account: account.id, school: account.school, courseId: null, moduleId: null, author: null, syncedAt: null}, execute}),
  }});
  const handleRequest = vi.fn((request, id) => engine.handleRequest(request, id));
  const onDisconnect = vi.fn((id: string) => engine.disconnect(id));
  let bridge: Awaited<ReturnType<typeof createWindowsBridge>> | undefined;
  let wire: Wire | undefined;
  const streams: Duplex[] = [];
  const diagnostics: string[] = [];
  try {
    engine.setEnabled(true);
    bridge = await createWindowsBridge({userData: root, script: resolve('resources/mcp/windows-pipe.ps1'), handleRequest, onDisconnect,
      diagnostic: text => {diagnostics.push(text); if (diagnostics.length > 10) diagnostics.shift();}});
    wire = await Wire.connect(bridge.endpoint.path);
    expect(await wire.rpc({method: 'ping', params: {}})).toMatchObject({enabled: true});
    const pending = pairBeginResultSchema.parse(await wire.rpc({method: 'pair.begin', params: {
      clientId: randomUUID(), clientName: 'Windows 課程 client', scopes: ['read:courses'],
    }}));
    engine.decidePairing({pairingId: pending.pairingId, approve: true, accountIds: [account.id], scopes: ['read:courses']});
    const {grant} = pairFinishResultSchema.parse(await wire.rpc({method: 'pair.finish', params: {pairingId: pending.pairingId}}));
    expect(await wire.rpc({method: 'tools.call', params: {grant, name: 'list_courses', args: {account: account.id}}})).toMatchObject({ok: true});
    expect(execute).toHaveBeenCalledOnce();
    const stored = persistence.read(root)!;
    expect(stored).not.toContain(grant);
    expect(JSON.parse(stored)).toMatchObject({enabled: true, grants: [{clientName: 'Windows 課程 client'}]});

    const stream = await connectLocalSocket(bridge.endpoint.path); streams.push(stream);
    const frames = new Frames();
    const response = new Promise<unknown>((accept, reject) => {
      stream.on('data', bytes => {try {for (const value of frames.push(bytes)) accept(value);} catch (error) {reject(error);}});
      stream.once('error', reject);
    });
    const request = encodeFrame({jsonrpc: '2.0', id: '課程-日本語', method: 'ping', params: {}});
    stream.write(request.subarray(0, 1));
    await new Promise(accept => setImmediate(accept));
    stream.write(request.subarray(1, 5));
    stream.write(request.subarray(5));
    expect(await response).toMatchObject({id: '課程-日本語', result: {enabled: true}});
    const before = handleRequest.mock.calls.length;
    const closed = disconnected(stream);
    const oversized = Buffer.alloc(4); oversized.writeUInt32BE(MCP_MAX_FRAME + 1);
    stream.write(oversized);
    await closed;
    expect(handleRequest).toHaveBeenCalledTimes(before);
    expect(await wire.rpc({method: 'ping', params: {}})).toMatchObject({enabled: true});
    wire.close();
    await bridge.dispose(); await bridge.closed;
    expect(onDisconnect).toHaveBeenCalled();
    const evidence = resolve('../../docs/evidence/distribution');
    await mkdir(evidence, {recursive: true});
    await writeFile(join(evidence, 'win32-mcp-roundtrip.json'), JSON.stringify({schemaVersion: 1, platform: process.platform,
      arch: process.arch, sameHandleClientVerified: true, pairedRead: true, privateStatePersisted: true, bearerAbsentFromState: true,
      fragmentedUnicodeFrame: true, oversizedRejectedBeforeDispatch: true, hostSurvived: true, shutdown: true,
      run: process.env.GITHUB_RUN_ID, commit: process.env.GITHUB_SHA}, null, 2) + '\n');
  } catch (error) {
    console.error('Synthetic Windows engine/pipe fixture failed', diagnostics);
    throw error;
  } finally {
    wire?.close(); for (const stream of streams) stream.destroy();
    await bridge?.dispose(); engine.dispose(); await rm(root, {recursive: true, force: true, maxRetries: 3});
  }
}, process.arch === 'arm64' ? 300_000 : 180_000);
