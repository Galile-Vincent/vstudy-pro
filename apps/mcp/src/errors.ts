/** Keep transport diagnostics fixed so peer errors cannot disclose credentials. @packageDocumentation */
import { WindowsAclError } from './windows-acl';
import type { McpErrorCode, ToolResult } from './contract';

export class BridgeError extends Error {
  constructor(readonly code: McpErrorCode, readonly hint: string) { super(code); }
}

export function failed(code: McpErrorCode, hint: string): ToolResult {
  return { ok: false, error: { code, message: `VStudy request failed (${code}).`, hint } };
}

export function failure(error: unknown): ToolResult {
  if (error instanceof WindowsAclError) return failed('DENIED', 'Windows private storage ACL verification failed. Pairing and saving credentials are disabled.');
  return error instanceof BridgeError ? failed(error.code, error.hint)
    : failed('INTERNAL', 'Check VStudy Settings > Agents and run vstudy-mcp doctor.');
}
