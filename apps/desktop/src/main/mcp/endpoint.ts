/** Resolve current-user bridge addresses without opening a transport or accepting a remote pipe host. @packageDocumentation */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, win32 } from 'node:path';
import type { McpEndpoint } from '../../shared/mcp-platform';
import { McpFailure } from './errors';

export function windowsPipeName(userSid:string):string {
  if (!/^S-1-\d+(?:-\d+){1,15}$/.test(userSid)) throw new McpFailure('INVALID_ARGUMENT');
  return '\\\\.\\pipe\\vstudy-'+createHash('sha256').update(userSid).digest('hex').slice(0,32);
}
export function currentWindowsSid():string {
  if (process.platform!=='win32') throw new McpFailure('UNSUPPORTED');
  const executable=win32.join(process.env.SystemRoot ?? 'C:\\Windows','System32','whoami.exe');
  const output=execFileSync(executable,['/user','/fo','csv','/nh'],{encoding:'utf8',timeout:2000,maxBuffer:8192,windowsHide:true});
  const sid=output.match(/\bS-1-\d+(?:-\d+){1,15}\b/g);
  if (sid?.length!==1) throw new McpFailure('DENIED');
  return sid[0]!;
}
export function resolveMcpEndpoint(userData:string,platform:NodeJS.Platform=process.platform,userIdentity?:string):McpEndpoint {
  if (platform==='win32') return {kind:'named-pipe',path:windowsPipeName(userIdentity ?? currentWindowsSid())};
  if (platform==='darwin' || platform==='linux') return {kind:'unix',path:join(userData,'mcp','bridge.sock')};
  throw new McpFailure('UNSUPPORTED');
}
