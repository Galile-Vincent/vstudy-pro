/** Runtime tests observe window restoration, transport startup, and storage-safe shutdown. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { McpBackend } from '../../shared/mcp';
import { createMcpRuntime } from './runtime';
import { GrantStore } from './grants';
import { testStatePersistence } from './state-test-fixture';
import { exclusiveStorage } from '../storage/maintenance';
import { call, pair, rpc } from './test-fixture';

const transport = vi.hoisted(() => ({dispose:vi.fn(async()=>{}),start:vi.fn()}));
vi.mock('./bridge',() => ({createUnixBridge:transport.start}));
const testTransport=async()=>{const bridge=await transport.start();return {endpoint:{kind:'unix' as const,path:bridge.socketPath},dispose:bridge.dispose};};
const roots:string[]=[];
afterEach(() => {for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});vi.clearAllMocks();});
function runtime(backend?:McpBackend) {
  const root=mkdtempSync(join(tmpdir(),'vm-runtime-'));roots.push(root);
  transport.start.mockResolvedValue({socketPath:join(root,'mcp/bridge.sock'),dispose:transport.dispose});
  const account={id:randomUUID(),school:'School',user:'Student'};
  const restoreWindow=vi.fn(),onFailure=vi.fn();
  const base:McpBackend={accounts:()=>[account],prepare:async()=>({accountId:account.id,target:'Course',provenance:{account:account.id,school:'School',courseId:null,moduleId:null,author:null,syncedAt:null},execute:async()=>({content:[]})})};
  const result=createMcpRuntime({userData:root,peerHelper:'/fixture/peer',backend:backend??base,secretValues:()=>[],transport:testTransport,...(testStatePersistence(root)?{persistence:testStatePersistence(root)!}:{}),restoreWindow,onFailure});
  return {result,account,restoreWindow,onFailure,root};
}
it('defers the bridge while off and restores the app only for new consent',async()=>{
  const f=runtime();await f.result.ready;
  expect(f.result.state().enabled).toBe(false);expect(transport.start).not.toHaveBeenCalled();expect(f.restoreWindow).not.toHaveBeenCalled();
  await f.result.setEnabled(true);
  const pending=await rpc(f.result.engine,'client','pair.begin',{clientId:randomUUID(),clientName:'Agent',scopes:['read:courses']});
  expect(pending.result).toHaveProperty('code');expect(f.restoreWindow).toHaveBeenCalledTimes(1);
  f.result.engine.state();expect(f.restoreWindow).toHaveBeenCalledTimes(1);
  await f.result.dispose();expect(transport.dispose).toHaveBeenCalledOnce();
});
it('drains an already-running backend read before shutdown returns',async()=>{
  let finish!:()=>void;
  const wait=new Promise<void>(resolve=>{finish=resolve;});
  const account={id:randomUUID(),school:'School',user:'Student'};
  const execute=vi.fn(async()=>{await wait;return {content:[]};});
  const f=runtime({accounts:()=>[account],prepare:async()=>({accountId:account.id,target:'Course',provenance:{account:account.id,school:'School',courseId:null,moduleId:null,author:null,syncedAt:null},execute})});
  await f.result.ready;await f.result.setEnabled(true);
  const paired=await pair(f.result.engine,[account.id],['read:courses']);
  const read=call(f.result.engine,paired.grant,'list_courses',{account:account.id});
  await vi.waitFor(()=>expect(execute).toHaveBeenCalledOnce());
  let closed=false;
  const disposing=f.result.dispose().then(()=>{closed=true;});
  await new Promise(resolve=>setImmediate(resolve));expect(closed).toBe(false);
  expect((await read).ok).toBe(false);
  finish();await disposing;expect(closed).toBe(true);
});
it('leaves access disabled after a failed bridge start and allows a later explicit retry',async()=>{
  const f=runtime();await f.result.ready;await f.result.dispose();
  transport.start.mockRejectedValueOnce(new Error('fixture failure'));
  const root=mkdtempSync(join(tmpdir(),'vm-runtime-'));roots.push(root);
  const store=new GrantStore(root,Date.now,testStatePersistence(root));store.setEnabled(true);
  const onFailure=vi.fn();
  const result=createMcpRuntime({userData:root,peerHelper:'/missing',backend:{accounts:()=>[],prepare:async()=>{throw Error('unused');}},secretValues:()=>[],transport:testTransport,...(testStatePersistence(root)?{persistence:testStatePersistence(root)!}:{}),restoreWindow:()=>{},onFailure});
  await result.setEnabled(true);expect(result.state().enabled).toBe(false);expect(onFailure).toHaveBeenCalledOnce();
  transport.start.mockResolvedValueOnce({socketPath:'/fixture',dispose:transport.dispose});
  await result.setEnabled(true);expect(result.engine.state().enabled).toBe(true);await result.dispose();
});

it('rejects bridge execution while exclusive storage maintenance owns the app',async()=>{
  const f=runtime();await f.result.ready;await f.result.setEnabled(true);
  const paired=await pair(f.result.engine,[f.account.id],['read:courses']);
  await exclusiveStorage(async()=>{},async()=>{
    expect(await call(f.result.engine,paired.grant,'list_courses',{account:f.account.id})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
  });
  expect(await call(f.result.engine,paired.grant,'list_courses',{account:f.account.id})).toMatchObject({ok:true});
  await f.result.dispose();
});

it('Windows-shaped process without getuid throws synchronously before runtime readiness and cannot fail only MCP closed', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'getuid')!;
  const onFailure = vi.fn();
  let result:ReturnType<typeof createMcpRuntime> | undefined;
  try {
    Object.defineProperty(process, 'getuid', {...descriptor, value:undefined});
    expect(() => { result = createMcpRuntime({userData:'/unused-review-path', backend:{accounts:()=>[], prepare:async()=>{throw Error('unused');}}, secretValues:()=>[], restoreWindow:()=>{}, onFailure}); }).not.toThrow();
    await result!.ready;
    expect(onFailure).not.toHaveBeenCalled();
    expect(transport.start).not.toHaveBeenCalled();
    await expect(result!.setEnabled(true)).resolves.toBeUndefined();
    expect(result!.state()).toMatchObject({enabled:false, unavailable:true, proposals:[], pairings:[]});
    expect(onFailure).toHaveBeenCalledOnce();
  } finally {
    Object.defineProperty(process, 'getuid', descriptor);
    await result?.dispose();
  }
});

it.each(['backend', 'persistence factory', 'persistence', 'transport'])('contains a synchronous %s construction failure until explicit retry', async stage => {
  const onFailure = vi.fn();
  const backend:McpBackend = {accounts:()=>[], prepare:async()=>{throw Error('unused');}};
  let broken = true;
  const construct = vi.fn(() => { if (stage === 'backend' && broken) throw Error('private path token=secret'); return backend; });
  const persistence = vi.fn(() => {
    if (stage === 'persistence factory' && broken) throw Error('private');
    return {read:()=>{if (stage === 'persistence' && broken) throw Error('private'); return undefined;}, write:()=>{}};
  });
  const result = createMcpRuntime({userData:'.', backend:construct, secretValues:()=>[], restoreWindow:()=>{}, onFailure,
    persistence,
    transport:()=>{if (stage === 'transport' && broken) throw Error('private'); return Promise.resolve({endpoint:{kind:'unix',path:'/fixture'},dispose:async()=>{}});},
  });
  expect(construct).not.toHaveBeenCalled();
  expect(persistence).not.toHaveBeenCalled();
  const enabling = result.setEnabled(true);
  await expect(result.ready).resolves.toBeUndefined();
  await enabling;
  expect(result.state()).toMatchObject({enabled:false, unavailable:true});
  expect(onFailure.mock.calls).toEqual([[]]);
  broken = false;
  await result.setEnabled(true);
  expect(result.state()).toMatchObject({enabled:true, unavailable:false});
  await result.dispose();
});
