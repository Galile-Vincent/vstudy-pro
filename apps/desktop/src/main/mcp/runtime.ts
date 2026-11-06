/** Compose the bridge with app-owned services and drain prepared work before storage closes. @packageDocumentation */
import type { McpBackend, PreparedMcpCall } from '../../shared/mcp';
import { createMcpEngine } from './engine';
import { createUnixBridge, type UnixBridge } from './bridge';

export interface McpRuntimeOptions {
  userData:string;
  peerHelper:string;
  backend:McpBackend;
  secretValues:()=>readonly string[];
  restoreWindow:()=>void;
  onFailure:()=>void;
}

/** Consent restores the existing app window. Background reads leave it hidden. */
export function createMcpRuntime(options:McpRuntimeOptions) {
  const work = new Set<Promise<unknown>>();
  let stopped = false;
  let bridge:UnixBridge|undefined;
  let starting:Promise<void>|undefined;
  let shown = new Set<string>();
  const track = <T>(operation:Promise<T>):Promise<T> => {
    work.add(operation);
    void operation.finally(() => work.delete(operation)).catch(() => {});
    return operation;
  };
  const backend:McpBackend = {
    accounts:options.backend.accounts,
    prepare:async (...args) => {
      const prepared = await track(options.backend.prepare(...args));
      const call:PreparedMcpCall = {...prepared,execute:() => track(prepared.execute())};
      return call;
    },
  };
  const engine = createMcpEngine({userData:options.userData,backend,secretValues:options.secretValues,onChange:() => {
    if (stopped) return;
    const state = engine.state();
    const pending = [...state.pairings,...state.proposals].map(item => item.id);
    if (pending.some(id => !shown.has(id))) options.restoreWindow();
    shown = new Set(pending);
  }});
  const start = ():Promise<void> => {
    if (stopped) return Promise.reject(new Error('MCP runtime stopped'));
    if (bridge) return Promise.resolve();
    return starting ??= createUnixBridge({userData:options.userData,peerHelper:options.peerHelper,
      handleRequest:(request,id) => engine.handleRequest(request,id),onDisconnect:id => engine.disconnect(id),
    }).then(value => {bridge=value;}).finally(() => {starting=undefined;});
  };
  const ready = start().catch(() => {if (!stopped) {engine.setEnabled(false);options.onFailure();}});
  return {
    engine,
    ready,
    async setEnabled(enabled:boolean) {if (enabled) await start();engine.setEnabled(enabled);},
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
