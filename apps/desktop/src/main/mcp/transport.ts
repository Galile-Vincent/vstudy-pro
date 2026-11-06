/** Adapt Unix authentication to the platform-neutral factory used by the app runtime. @packageDocumentation */
import type { McpTransportFactory, McpTransportOptions, McpTransport } from '../../shared/mcp-platform';
import { createUnixBridge } from './bridge';
import { McpFailure } from './errors';
export type { McpTransportFactory, McpTransportOptions, McpTransport } from '../../shared/mcp-platform';

export const createUnixTransport:McpTransportFactory=async options=>{
  if (!options.peerHelper) throw new McpFailure('UNSUPPORTED');
  const bridge=await createUnixBridge({...options,peerHelper:options.peerHelper});
  return {endpoint:{kind:'unix',path:bridge.socketPath},dispose:bridge.dispose};
};
/** Stream P supplies a current-user-ACL named-pipe factory through runtime.transport on Windows. */
export function createPlatformBridge(options:McpTransportOptions,platform:NodeJS.Platform=process.platform):Promise<McpTransport> {
  if (platform==='darwin' || platform==='linux') return createUnixTransport(options);
  return Promise.reject(new McpFailure('UNSUPPORTED'));
}
