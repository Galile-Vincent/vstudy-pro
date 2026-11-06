/** Platform transports share the same authenticated request and lifecycle boundary. @packageDocumentation */
import type { BridgeRequest, BridgeResponse } from './mcp';
export type McpEndpoint = {kind:'unix';path:string}|{kind:'named-pipe';path:string};
export interface McpTransport {
  endpoint:McpEndpoint;
  dispose:()=>Promise<void>;
}
export interface McpTransportOptions {
  userData:string;
  peerHelper?:string;
  handleRequest:(request:BridgeRequest,connectionId:string)=>Promise<BridgeResponse>;
  onDisconnect:(connectionId:string)=>void;
}
/** Verify the peer before parsing frames. Windows implementations must restrict the pipe ACL to the current user SID. */
export type McpTransportFactory=(options:McpTransportOptions)=>Promise<McpTransport>;

/** Platform storage must verify current-user ownership, private access, size limits, and atomic durable replacement. */
export interface McpStatePersistence {
  read:(userData:string)=>string|undefined;
  write:(userData:string,text:string)=>void;
}
