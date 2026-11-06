/** Consume the fixed app-owned contract without another tool or scope registry. @packageDocumentation */
export {
  MCP_PROTOCOL_VERSION, MCP_MAX_FRAME, defaultScopes, clientKindSchema,
  mcpTools, toolResultSchema, bridgeRequestSchema, bridgeResponseSchema,
  pairBeginResultSchema, pairFinishResultSchema,
} from '../../desktop/src/shared/mcp';
export type {
  ClientKind, ToolName, ToolResult, BridgeRequest, BridgeResponse, McpErrorCode,
} from '../../desktop/src/shared/mcp';
