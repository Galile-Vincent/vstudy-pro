/** MCP decisions remain behind main-frame sender validation and strict IPC schemas. @packageDocumentation */
import { expect, it, vi } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { registerMcpIpc } from './mcp';
import { createIpcRegistrar } from './register';
import type { McpRuntime } from '../mcp/runtime';
import { fixture } from '../mcp/test-fixture';
import type { createAgentNavigation } from '../mcp/navigation';
it('rejects foreign senders and extra decision fields before calling any privileged operation',async()=>{
  const f=fixture();
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>Promise<unknown>>();
  const ipc={handle:(channel:string,handler:(event:IpcMainInvokeEvent,payload:unknown)=>Promise<unknown>)=>handlers.set(channel,handler),removeHandler:(channel:string)=>handlers.delete(channel)} as unknown as Pick<IpcMain,'handle'|'removeHandler'>;
  const trusted={sender:{mainFrame:{}}} as unknown as IpcMainInvokeEvent;
  Object.assign(trusted,{senderFrame:trusted.sender.mainFrame});
  const registrar=createIpcRegistrar(ipc,event=>event===trusted);
  const approve=vi.spyOn(f.engine,'decideProposal');
  const navigation={take:vi.fn(()=>null),clear:vi.fn()} as unknown as ReturnType<typeof createAgentNavigation>;
  const runtime={engine:f.engine,state:()=>f.engine.state(),setEnabled:async(value:boolean)=>f.engine.setEnabled(value)} as McpRuntime;
  registerMcpIpc(registrar,new Set(),runtime,navigation,{list:async()=>[],install:async()=>({diff:'',changed:false}),doctor:async()=>({ok:true,checks:[]})});
  await expect(handlers.get('mcp:proposal-decision')!({} as IpcMainInvokeEvent,{proposalId:f.account.id,approve:true})).rejects.toThrow('Untrusted');
  await expect(handlers.get('mcp:proposal-decision')!(trusted,{proposalId:f.account.id,approve:true,grant:'stolen'})).rejects.toThrow();
  expect(approve).not.toHaveBeenCalled();
  expect(await handlers.get('mcp:enable')!(trusted,{enabled:true})).toEqual({ok:true});
  expect(f.engine.state().enabled).toBe(true);
  expect(await handlers.get('mcp:enable')!(trusted,{enabled:false})).toEqual({ok:true});
  expect(navigation.clear).toHaveBeenCalledOnce();registrar.dispose();
});
