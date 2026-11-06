/** Same-UID Unix transport bounds connections, frames, concurrent calls, idle time, and shutdown. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, type Stats } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { MCP_MAX_FRAME, type BridgeRequest, type BridgeResponse } from '../../shared/mcp';
import { McpFailure, publicFailure } from './errors';
import { peerUid } from './peer';
import { RequestFrames, responseFrame } from './protocol';
import { claimSocketPath, unlinkOwned } from './socket-path';

export interface UnixBridgeOptions {
  userData: string;
  peerHelper: string;
  handleRequest: (request: BridgeRequest, connectionId: string) => Promise<BridgeResponse>;
  onDisconnect: (connectionId: string) => void;
  verifyPeer?: typeof peerUid;
  idleMs?: number;
  requestTimeoutMs?: number;
  maxConnections?: number;
  maxPerConnection?: number;
  maxActive?: number;
}
export interface UnixBridge {socketPath: string; dispose: () => Promise<void>}

/** Authentication completes before the first protocol byte is parsed or passed to the engine. */
export async function createUnixBridge(options: UnixBridgeOptions): Promise<UnixBridge> {
  const uid = process.getuid?.();
  if (uid === undefined) throw new McpFailure('UNSUPPORTED');
  const claimed = await claimSocketPath(options.userData);
  const sockets = new Set<Socket>();
  let active = 0;
  let ready = false;
  let identity: Stats | undefined;
  let disposing: Promise<void> | undefined;
  const server = createServer({pauseOnConnect: true}, socket => {
    if (!ready || sockets.size >= (options.maxConnections ?? 32)) { socket.destroy(); return; }
    const connectionId = randomUUID();
    sockets.add(socket);
    const pending = new Set<string>();
    const timers = new Set<NodeJS.Timeout>();
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      sockets.delete(socket);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      options.onDisconnect(connectionId);
    });
    socket.setTimeout(options.idleMs ?? 90_000, () => socket.destroy());

    const send = (response: BridgeResponse) => {
      if (socket.destroyed) return;
      if (socket.writableLength > 2 * MCP_MAX_FRAME) { socket.destroy(); return; }
      try { socket.write(responseFrame(response)); }
      catch { socket.destroy(); }
    };
    const accept = (request: BridgeRequest) => {
      if (socket.destroyed) return;
      if (pending.has(request.id) || pending.size >= (options.maxPerConnection ?? 4) || active >= (options.maxActive ?? 32)) {
        socket.destroy();
        throw new McpFailure('RATE_LIMITED');
      }
      pending.add(request.id);
      active++;
      const timer = setTimeout(() => socket.destroy(), options.requestTimeoutMs ?? 125_000);
      timer.unref();
      timers.add(timer);
      void Promise.resolve().then(() => options.handleRequest(request, connectionId)).then(response => send(response), () => {
        const failure = publicFailure('INTERNAL').error;
        send({jsonrpc: '2.0', id: request.id, error: {code: -32603, message: failure.message, data: {code: failure.code, hint: failure.hint}}});
      }).finally(() => {
        clearTimeout(timer);
        timers.delete(timer);
        pending.delete(request.id);
        active--;
      });
    };
    void Promise.resolve().then(() => (options.verifyPeer ?? peerUid)(socket, options.peerHelper)).then(peer => {
      if (peer !== uid || socket.destroyed) { socket.destroy(); return; }
      const frames = new RequestFrames();
      socket.on('data', chunk => { try { frames.push(chunk, accept); } catch { socket.destroy(); } });
      socket.resume();
    }, () => socket.destroy());
  });
  server.on('error', () => { for (const socket of sockets) socket.destroy(); });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(claimed.path, () => { server.removeListener('error', reject); resolve(); });
    });
    identity = lstatSync(claimed.path);
    if (!identity.isSocket() || identity.uid !== uid) throw new McpFailure('DENIED');
    chmodSync(claimed.path, 0o600);
    ready = true;
  } catch (error) {
    server.close();
    if (identity) unlinkOwned(claimed.path, identity);
    claimed.release();
    throw error;
  }
  return {
    socketPath: claimed.path,
    dispose: () => {
      if (disposing) return disposing;
      ready = false;
      disposing = new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          try { if (identity) unlinkOwned(claimed.path, identity); claimed.release(); resolve(); }
          catch { reject(new McpFailure('INTERNAL')); }
        });
      });
      return disposing;
    },
  };
}
