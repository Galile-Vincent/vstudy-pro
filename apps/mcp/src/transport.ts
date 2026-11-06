/** Authenticate local socket permissions and correlate bounded framed RPC calls. @packageDocumentation */
import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { bridgeRequestSchema, bridgeResponseSchema, type BridgeRequest, type BridgeResponse } from './contract';
import { assertNoSymlinks } from './files';
import { encodeFrame, Frames } from './framing';
import { BridgeError } from './errors';

type Pending = { id: string; frame: Buffer; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type RpcCall = BridgeRequest extends infer R ? R extends BridgeRequest ? Pick<R, 'method' | 'params'> : never : never;

export class Wire {
  private readonly frames = new Frames();
  private readonly pending = new Map<string, Pending>();
  private readonly queue: Pending[] = [];
  closed = false;

  private constructor(private readonly socket: Socket) {
    socket.on('data', chunk => {
      try {
        for (const value of this.frames.push(chunk)) this.receive(bridgeResponseSchema.parse(value));
      } catch { this.close(new BridgeError('INTERNAL', 'The VStudy bridge sent an invalid response. Restart the app.')); }
    });
    socket.on('error', () => this.close());
    socket.on('close', () => this.close());
    socket.on('end', () => this.close());
  }

  static async connect(path: string): Promise<Wire> {
    assertNoSymlinks(path);
    const directory = lstatSync(dirname(path));
    const socketFile = lstatSync(path);
    if (!directory.isDirectory() || !socketFile.isSocket()
      || (directory.mode & 0o777) !== 0o700 || (socketFile.mode & 0o777) !== 0o600
      || (process.getuid && (directory.uid !== process.getuid() || socketFile.uid !== process.getuid()))) {
      throw new BridgeError('DENIED', 'The bridge directory must be private (0700) and its socket owned by you (0600).');
    }
    return new Promise((resolve, reject) => {
      const socket = createConnection(path);
      const timer = setTimeout(() => { socket.destroy(); reject(new BridgeError('TIMEOUT', 'VStudy did not accept the local connection.')); }, 2000);
      const onError = (error: Error) => { clearTimeout(timer); socket.destroy(); reject(error); };
      socket.once('error', onError);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeListener('error', onError);
        resolve(new Wire(socket));
      });
    });
  }

  rpc(call: RpcCall, timeoutMs = 65_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new BridgeError('DISCONNECTED', 'VStudy disconnected. Read calls can reconnect; check writes in the app before retrying.'));
    if (this.pending.size + this.queue.length >= 32) return Promise.reject(new BridgeError('RATE_LIMITED', 'Wait for pending VStudy calls to finish.'));
    const request = bridgeRequestSchema.parse({ jsonrpc: '2.0', id: randomUUID(), ...call });
    const frame = encodeFrame(request);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new BridgeError('TIMEOUT', 'The request timed out. Check VStudy before retrying a proposed action.')), timeoutMs);
      this.queue.push({ id: request.id, frame, resolve, reject, timer });
      this.flush();
    });
  }

  close(error = new BridgeError('DISCONNECTED', 'VStudy disconnected. Check proposed actions in the app before retrying.')): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    for (const pending of [...this.pending.values(), ...this.queue]) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.queue.length = 0;
  }

  private flush(): void {
    while (!this.closed && this.pending.size < 4 && this.queue.length) {
      const call = this.queue.shift()!;
      this.pending.set(call.id, call);
      this.socket.write(call.frame, error => { if (error) this.close(); });
    }
  }

  private receive(response: BridgeResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) throw new Error('Uncorrelated response.');
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new BridgeError(response.error.data?.code ?? 'INTERNAL', 'Check VStudy Settings > Agents for access, scopes, approvals, and account selection.'));
    } else pending.resolve(response.result);
    this.flush();
  }
}
