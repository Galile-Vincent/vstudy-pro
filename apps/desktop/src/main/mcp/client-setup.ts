/** Adapt safe client configuration to the installed app paths without shell execution or bearer arguments. @packageDocumentation */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, win32 } from 'node:path';
import { detectClients, doctor, installClient, type ClientOptions } from '../../../../mcp/src/public';
import { findExecutable } from '../../../../mcp/src/client-config';
import type { AgentClientSetup } from '../ipc/mcp';

export function agentInstallCommand(command: string, serverBin: string, client: string, platform: NodeJS.Platform = process.platform): string {
  const quote = platform === 'win32'
    ? (value: string) => "'" + value.replaceAll("'", "''") + "'"
    : (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return [(platform === 'win32' ? '& ' : '') + quote(command), quote(serverBin), 'install', '--client', client].join(' ');
}
export function createAgentClientSetup(serverBin:string,userData:string,overrides:Omit<ClientOptions,'client'|'binPath'|'dryRun'> = {}):AgentClientSetup {
  const environment=overrides.environment ?? {...process.env,PATH:[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin',join(homedir(),'.local/bin'),join(homedir(),'.volta/bin')].filter(Boolean).join(delimiter)};
  const options={...overrides,environment,binPath:serverBin};
  const runtime=()=>overrides.command ?? findExecutable('node',environment);
  return {
    async list() {
      const found = runtime();
      const command = found ?? (process.platform === 'win32' ? win32.join(environment.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe') : '/usr/local/bin/node');
      return detectClients({...options,command}).map(client=>({...client,command:agentInstallCommand(found ?? 'node',serverBin,client.client)}));
    },
    async install(client,dryRun) {
      const command=runtime();
      if (!command || !existsSync(serverBin)) throw new Error('MCP runtime unavailable');
      const result=installClient({...options,command,client,dryRun});
      return {changed:result.changed,diff:result.diff};
    },
    async doctor() {
      return doctor({...options,userData,...(runtime()?{command:runtime()!}:{})});
    },
  };
}
