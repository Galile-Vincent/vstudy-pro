/** Compose the bridge with app-owned services and drain prepared work before storage closes. @packageDocumentation */
import type { McpBackend, PreparedMcpCall } from '../../shared/mcp';
import type { McpStatePersistence } from '../../shared/mcp-platform';
import { createMcpEngine } from './engine';
import { createPlatformBridge, type McpTransport, type McpTransportFactory } from './transport';
import { enterStorageRequest } from '../storage/maintenance';
import { McpFailure } from './errors';

export interface McpRuntimeOptions {
  userData:string;
  peerHelper?:string;
  transport?:McpTransportFactory;
  persistence?:McpStatePersistence;
  backend:McpBackend;
  secretValues:()=>readonly string[];
  restoreWindow:()=>void;
  onFailure:()=>void;
}

/** Consent restores the existing app window. Background reads leave it hidden. */
export function createMcpRuntime(options:McpRuntimeOptions) {
  const work = new Set<Promise<unknown>>();
  let stopped = false;
  let bridge:McpTransport|undefined;
  let transportLost=false;
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
  const backend:McpBackend = {
    accounts:options.backend.accounts,
    prepare:async (...args) => {
      const prepared = await withStorage(() => options.backend.prepare(...args));
      const call:PreparedMcpCall = {...prepared,execute:(signal,authorize) => withStorage(() => prepared.execute(signal,authorize))};
      return call;
    },
  };
  const engine = createMcpEngine({userData:options.userData,backend,secretValues:options.secretValues,...(options.persistence?{persistence:options.persistence}:{}),onChange:() => {
    if (stopped) return;
    const state = engine.state();
    const pending = [...state.pairings,...state.proposals].map(item => item.id);
    if (pending.some(id => !shown.has(id))) options.restoreWindow();
    shown = new Set(pending);
  }});
  const start = ():Promise<void> => {
    if (stopped) return Promise.reject(new Error('MCP runtime stopped'));
    if (bridge) return Promise.resolve();
    return starting ??= (options.transport ?? createPlatformBridge)({userData:options.userData,...(options.peerHelper?{peerHelper:options.peerHelper}:{}),
      handleRequest:(request,id) => engine.handleRequest(request,id),onDisconnect:id => engine.disconnect(id),
    }).then(value => {
      bridge=value;
      const closed=() => {
        if (stopped || bridge!==value) return;
        bridge=undefined;
        transportLost=true;
        try {engine.setEnabled(false);} catch { /* A failed state write cannot reopen a lost transport. */ }
        options.onFailure();
      };
      void value.closed?.then(closed,closed);
    }).finally(() => {starting=undefined;});
  };
  const ready = start().catch(() => {if (!stopped) {engine.setEnabled(false);options.onFailure();}});
  return {
    engine,
    ready,
    async setEnabled(enabled:boolean) {
      if (enabled) {
        // Require the disabled state to persist before replacing a lost native host.
        if (transportLost) engine.setEnabled(false);
        await start();
      }
      engine.setEnabled(enabled);
      if (enabled) transportLost=false;
    },
    async dispose() {
      if (stopped) return;
      stopped=true;
      engine.dispose();
      await ready;
      await starting?.catch(() => {});
      await bridge?.dispose();
      await Promise.allSettled([...work]);
    },
  };
}
export type McpRuntime = ReturnType<typeof createMcpRuntime>;
