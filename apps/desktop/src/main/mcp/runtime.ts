/** Compose the bridge with app-owned services and drain prepared work before storage closes. @packageDocumentation */
import type { AgentsState, McpBackend, PreparedMcpCall } from '../../shared/mcp';
import type { McpStatePersistence } from '../../shared/mcp-platform';
import { createMcpEngine, type McpEngine } from './engine';
import { createPlatformBridge, type McpTransport, type McpTransportFactory } from './transport';
import { enterStorageRequest } from '../storage/maintenance';
import { McpFailure } from './errors';

export interface McpRuntimeOptions {
  userData:string;
  peerHelper?:string;
  transport?:McpTransportFactory;
  persistence?:McpStatePersistence|(()=>McpStatePersistence|undefined);
  backend:McpBackend|(()=>McpBackend);
  secretValues:()=>readonly string[];
  restoreWindow:()=>void;
  onFailure:()=>void;
}

/** Consent restores the existing app window. Background reads leave it hidden. */
export function createMcpRuntime(options:McpRuntimeOptions) {
  const work = new Set<Promise<unknown>>();
  let stopped = false;
  let bridge:McpTransport|undefined;
  let starting:Promise<void>|undefined;
  let shown = new Set<string>();
  const track = <T>(operation:Promise<T>):Promise<T> => {
    work.add(operation);
    void operation.finally(() => work.delete(operation)).catch(() => {});
    return operation;
  };
  const withStorage = <T>(operation:()=>Promise<T>):Promise<T> => {
    let release:()=>void;
    try {release=enterStorageRequest();} catch {return Promise.reject(new McpFailure('RATE_LIMITED'));}
    return track(Promise.resolve().then(operation).finally(release));
  };
  let engine:McpEngine|undefined;
  let requestedEnabled = false;
  let unavailable = false;
  const state = ():AgentsState => ({
    ...(engine?.state() ?? {enabled:false, grants:[], pairings:[], proposals:[], activity:[], activeCalls:0, accounts:[]}),
    unavailable,
  });
  const start = ():Promise<void> => {
    if (stopped) return Promise.reject(new McpFailure('DISCONNECTED'));
    if (bridge && engine) return Promise.resolve();
    return starting ??= Promise.resolve().then(async () => {
      const source = typeof options.backend === 'function' ? options.backend() : options.backend;
      const backend:McpBackend = {
        accounts:source.accounts,
        prepare:async (...args) => {
          const prepared = await withStorage(() => source.prepare(...args));
          const call:PreparedMcpCall = {...prepared, execute:(signal, authorize) => withStorage(() => prepared.execute(signal, authorize))};
          return call;
        },
      };
      const persistence=typeof options.persistence==='function' ? options.persistence() : options.persistence;
      const created = createMcpEngine({userData:options.userData, backend, secretValues:options.secretValues,
        ...(persistence ? {persistence} : {}), onChange:() => {
          if (stopped) return;
          const current = state();
          const pending = [...current.pairings, ...current.proposals].map(item => item.id);
          if (pending.some(id => !shown.has(id))) options.restoreWindow();
          shown = new Set(pending);
        },
      });
      engine = created;
      created.setEnabled(false);
      bridge = await (options.transport ?? createPlatformBridge)({userData:options.userData,
        ...(options.peerHelper ? {peerHelper:options.peerHelper} : {}),
        handleRequest:(request, id) => created.handleRequest(request, id), onDisconnect:id => created.disconnect(id),
      });
    }).finally(() => {starting = undefined;});
  };
  return {
    get engine() { if (!engine) throw new McpFailure('DISABLED'); return engine; },
    get ready() { return starting?.catch(() => {}) ?? Promise.resolve(); },
    state,
    async setEnabled(enabled:boolean) {
      requestedEnabled = enabled;
      try {
        if (enabled) await start();
        if (!stopped) engine?.setEnabled(requestedEnabled);
        unavailable = false;
      } catch {
        unavailable = true;
        requestedEnabled = false;
        try { engine?.setEnabled(false); } catch { /* Persistence failure must not escape into desktop startup. */ }
        engine?.dispose();
        engine = undefined;
        await bridge?.dispose().catch(() => {});
        bridge = undefined;
        if (!stopped) options.onFailure();
      }
    },
    async dispose() {
      if (stopped) return;
      stopped = true;
      engine?.dispose();
      await starting?.catch(() => {});
      engine?.dispose();
      await bridge?.dispose();
      await Promise.allSettled([...work]);
    },
  };
}
export type McpRuntime = ReturnType<typeof createMcpRuntime>;
