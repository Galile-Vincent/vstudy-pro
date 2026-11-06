/** Only sender-validated renderer IPC can change grants, approve actions, or consume navigation. @packageDocumentation */
import { mcpIpc } from '../../shared/mcp';
import type { IpcChannel, IpcResponse } from '../../shared/ipc';
import type { createIpcRegistrar } from './register';
import type { McpRuntime } from '../mcp/runtime';
import type { createAgentNavigation } from '../mcp/navigation';

export interface AgentClientSetup {
  list:()=>Promise<IpcResponse<'mcp:clients'>>;
  install:(client:IpcResponse<'mcp:clients'>[number]['client'],dryRun:boolean)=>Promise<IpcResponse<'mcp:install'>>;
  doctor:()=>Promise<IpcResponse<'mcp:doctor'>>;
}
export function registerMcpIpc(registrar:ReturnType<typeof createIpcRegistrar>,implemented:Set<IpcChannel>,runtime:McpRuntime,navigation:ReturnType<typeof createAgentNavigation>,clients:AgentClientSetup) {
  for (const channel of Object.keys(mcpIpc) as (keyof typeof mcpIpc)[]) implemented.add(channel);
  implemented.add('mcp:take-navigation');
  registrar.handle('mcp:state',()=>runtime.state());
  registrar.handle('mcp:enable',async({enabled})=>{await runtime.setEnabled(enabled);if(!enabled)navigation.clear();return {ok:true};});
  registrar.handle('mcp:revoke',({grantId})=>{runtime.engine.revoke(grantId);navigation.clear();return {ok:true};});
  registrar.handle('mcp:edit-grant',request=>{runtime.engine.editGrant(request);navigation.clear();return {ok:true};});
  registrar.handle('mcp:pair-decision',request=>{runtime.engine.decidePairing(request);return {ok:true};});
  registrar.handle('mcp:proposal-decision',request=>{runtime.engine.decideProposal(request);return {ok:true};});
  registrar.handle('mcp:take-navigation',()=>navigation.take());
  registrar.handle('mcp:clients',()=>clients.list());
  registrar.handle('mcp:install',request=>clients.install(request.client,request.dryRun));
  registrar.handle('mcp:doctor',()=>clients.doctor());
}
