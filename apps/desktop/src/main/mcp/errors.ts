/** Fixed public failures keep backend diagnostics and school credentials in main. @packageDocumentation */
import { errorCodeSchema, type McpErrorCode, type ToolResult } from '../../shared/mcp';

const hints: Record<McpErrorCode, string> = {
  DISABLED: 'Enable agent access in VStudy Settings > Agents.',
  UNPAIRED: 'Pair this client in VStudy Settings > Agents.',
  DENIED: 'Review this request in VStudy Settings > Agents.',
  EXPIRED: 'Pair this client again in VStudy Settings > Agents.',
  SCOPE_REQUIRED: 'Ask the student to review the grant scopes in VStudy.',
  ACCOUNT_REQUIRED: 'Choose an account returned by list_accounts.',
  NOT_FOUND: 'Refresh the available items in VStudy and try again.',
  UNSUPPORTED: 'Finish this operation yourself in Moodle. If a mobile service is missing, ask the school to enable it.',
  INVALID_ARGUMENT: 'Use the documented tool schema and stable VStudy IDs.',
  RATE_LIMITED: 'Wait before making another request.',
  TIMEOUT: 'Review the current state in VStudy before proposing the action again.',
  DISCONNECTED: 'Reconnect to VStudy and try again.',
  INTERNAL: 'Check VStudy and retry reads. Check the outcome before repeating a write.',
  ACADEMIC_INTEGRITY: 'Complete graded activities yourself in Moodle.',
  SESSION_REQUIRED: 'Sign in to this school again in VStudy.',
};

/** Backends may throw a code without exposing an exception message to clients. */
export class McpFailure extends Error {
  constructor(readonly code: McpErrorCode) { super(code); }
}

/** Convert only recognized codes and Moodle failure categories into public failures. */
export function failureCode(error: unknown): McpErrorCode {
  if (error instanceof McpFailure) return error.code;
  if (typeof error !== 'object' || error === null) return 'INTERNAL';
  if ('kind' in error && error.kind === 'auth') return 'SESSION_REQUIRED';
  if ('kind' in error && error.kind === 'unsupported') return 'UNSUPPORTED';
  if ('kind' in error && error.kind === 'permission') return 'DENIED';
  const parsed = errorCodeSchema.safeParse('code' in error ? error.code : undefined);
  return parsed.success ? parsed.data : 'INTERNAL';
}

/** Public messages are application text, never raw exceptions. */
export function publicFailure(code: McpErrorCode): Extract<ToolResult, {ok: false}> {
  return {ok: false, error: {code, message: `VStudy request failed (${code}).`, hint: hints[code]}};
}
