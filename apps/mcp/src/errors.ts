/** Keep transport diagnostics fixed so peer errors cannot disclose credentials. @packageDocumentation */
import type { McpErrorCode, ToolResult } from './contract';

export class BridgeError extends Error {
  constructor(readonly code: McpErrorCode, readonly hint: string) { super(code); }
}

export function failed(code: McpErrorCode, hint: string): ToolResult {
  return { ok: false, error: { code, message: `VStudy request failed (${code}).`, hint } };
}

export function failure(error: unknown): ToolResult {
  return error instanceof BridgeError ? failed(error.code, error.hint)
    : failed('INTERNAL', 'Check VStudy Settings > Agents and run vstudy-mcp doctor.');
}
