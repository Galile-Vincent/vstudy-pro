/** Pair lazily and retry only contract-declared reads after an uncertain disconnect. @packageDocumentation */
import { setTimeout as delay } from 'node:timers/promises';
import {
  defaultScopes, MCP_PROTOCOL_VERSION, mcpTools, pairBeginResultSchema,
  pairFinishResultSchema, toolResultSchema, type ToolName, type ToolResult,
} from './contract';
import { z } from 'zod';
import { Credentials } from './credentials';
import { BridgeError, failed, failure } from './errors';
import { Wire } from './transport';
import { launchApplication } from './launch';
import type { WireConnector } from './connection';

const pingSchema = z.object({ version: z.literal(MCP_PROTOCOL_VERSION), enabled: z.boolean() }).passthrough();
export interface BridgeOptions {
  socketPath: string;
  credentials: Credentials;
  clientName: string;
  stderr: (text: string) => void;
  launch?: () => Promise<void>;
  backoffMs?: readonly number[];
  connector?: WireConnector;
}

export function launchApp(): Promise<void> { return launchApplication(); }

export class BridgeClient {
  private ready: Promise<{ wire: Wire; grant: string }> | undefined;
  private lastLaunch = 0;
  private state: { kind: 'running'; wire: Wire | undefined; controller: AbortController } | { kind: 'closed' } = { kind: 'running', wire: undefined, controller: new AbortController() };

  constructor(private readonly options: BridgeOptions) {}

  async call(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = mcpTools[name].schema.safeParse(args);
    if (!parsed.success) return failed('INVALID_ARGUMENT', 'Use the advertised tool schema and local IDs returned by VStudy.');
    const attempts = mcpTools[name].risk === 'read' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const { wire, grant } = await this.connection();
        const result = toolResultSchema.parse(await wire.rpc({ method: 'tools.call', params: { grant, name, args: parsed.data } }, 130_000));
        if (JSON.stringify(result).includes(grant)) throw new BridgeError('INTERNAL', 'The bridge returned protected local authentication data. Check VStudy.');
        return result;
      } catch (error) {
        if (error instanceof BridgeError && error.code === 'DISCONNECTED') {
          this.ready = undefined;
          if (attempt + 1 < attempts) continue;
        }
        return failure(error);
      }
    }
    return failed('DISCONNECTED', 'Open VStudy and retry the read.');
  }

  async close(): Promise<void> {
    const state = this.state;
    this.state = { kind: 'closed' };
    this.ready = undefined;
    if (state.kind === 'running') { state.controller.abort(); state.wire?.close(); }
  }

  private async connection(): Promise<{ wire: Wire; grant: string }> {
    if (this.state.kind === 'closed') throw new BridgeError('DISCONNECTED', 'The VStudy client has closed.');
    if (this.ready) {
      const connection = await this.ready;
      if (!connection.wire.closed) return connection;
      this.ready = undefined;
    }
    const ready = this.authenticate();
    this.ready = ready;
    try { return await ready; }
    catch (error) { if (this.ready === ready) this.ready = undefined; throw error; }
  }

  private async authenticate(): Promise<{ wire: Wire; grant: string }> {
    const wire = await this.connect();
    try {
      const identity = this.options.credentials.identity();
      if (identity.grant) {
        if (!identity.expiresAt || Date.parse(identity.expiresAt) <= Date.now()) {
          throw new BridgeError('EXPIRED', 'Your local grant expired. Reconnect this client in VStudy Settings > Agents.');
        }
        return { wire, grant: identity.grant };
      }
      const pairing = pairBeginResultSchema.parse(await wire.rpc({ method: 'pair.begin', params: {
        clientId: identity.clientId, clientName: this.options.clientName, scopes: defaultScopes,
      } }));
      if (!/^[A-Z0-9-]{6,12}$/.test(pairing.code)) throw new Error('Invalid comparison code.');
      this.options.stderr(`VStudy pairing code ${pairing.code}. Compare it in Settings > Agents and approve this client.\n`);
      const result = await this.finishPairing(wire, pairing);
      if (result.grantInfo.clientId !== identity.clientId || result.grantInfo.revokedAt
        || Date.parse(result.grantInfo.expiresAt) <= Date.now()) throw new Error('Invalid local grant.');
      this.options.credentials.save({ clientId: identity.clientId, grant: result.grant, expiresAt: result.grantInfo.expiresAt });
      return { wire, grant: result.grant };
    } catch (error) { wire.close(); throw error; }
  }

  private async finishPairing(wire: Wire, pairing: { pairingId: string; expiresAt: string }) {
    const deadline = Date.parse(pairing.expiresAt);
    while (Date.now() < deadline) {
      try {
        return pairFinishResultSchema.parse(await wire.rpc({ method: 'pair.finish', params: { pairingId: pairing.pairingId } }, Math.min(65_000, deadline - Date.now())));
      } catch (error) {
        if (!(error instanceof BridgeError && error.code === 'DENIED') || wire.closed) throw error;
        await this.wait(Math.min(500, Math.max(0, deadline - Date.now())));
      }
    }
    throw new BridgeError('EXPIRED', 'Pairing expired. Request access again and compare the code in VStudy.');
  }

  private wait(ms: number): Promise<void> {
    if (this.state.kind === 'closed') return Promise.reject(new BridgeError('DISCONNECTED', 'The VStudy client has closed.'));
    return delay(ms, undefined, { signal: this.state.controller.signal }).catch(() => { throw new BridgeError('DISCONNECTED', 'The VStudy client has closed.'); });
  }

  private async connect(): Promise<Wire> {
    for (const [index, backoff] of (this.options.backoffMs ?? [0, 100, 250, 500, 1000, 2000, 3000]).entries()) {
      if (backoff) await this.wait(backoff);
      try {
        if (this.state.kind === 'closed') throw new BridgeError('DISCONNECTED', 'The VStudy client has closed.');
        const state = this.state;
        const wire = await Wire.connect(this.options.socketPath, this.options.connector);
        if (this.state !== state) { wire.close(); throw new BridgeError('DISCONNECTED', 'The VStudy client has closed.'); }
        state.wire = wire;
        return wire;
      }
      catch (error) {
        const unavailable = error instanceof Error && 'code' in error
          && (error.code === 'ENOENT' || error.code === 'ECONNREFUSED');
        if (!unavailable) throw error;
        if (index === 0 && Date.now() - this.lastLaunch >= 30_000) {
          this.lastLaunch = Date.now();
          await (this.options.launch ?? launchApp)();
        }
      }
    }
    throw new BridgeError('DISCONNECTED', 'Open VStudy Pro, enable Settings > Agents, and retry.');
  }
}

export async function pingBridge(socketPath: string): Promise<number> {
  const wire = await Wire.connect(socketPath);
  try { return (await pingWire(wire)).version; }
  finally { wire.close(); }
}

export async function pingWire(wire: Wire) {
  return pingSchema.parse(await wire.rpc({ method: 'ping', params: {} }, 2000));
}
