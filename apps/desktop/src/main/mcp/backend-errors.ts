/** Fixed backend failures cross the agent boundary without school or filesystem diagnostics. @packageDocumentation */
import type { McpErrorCode } from '../../shared/mcp';
import { MoodleError } from '../moodle/client';

const failures: Partial<Record<McpErrorCode, readonly [string, string]>> = {
  DENIED: ['The target is outside the selected account.', 'Select a granted account and a target belonging to that account.'],
  ACCOUNT_REQUIRED: ['Select a school account.', 'Use list_accounts, then supply an account ID.'],
  NOT_FOUND: ['The requested item is unavailable.', 'Sync the account in VStudy and select a current item.'],
  UNSUPPORTED: ['This operation is unavailable for this school or activity.', 'Complete this operation in VStudy or Moodle.'],
  INVALID_ARGUMENT: ['The request is invalid.', 'Use the documented tool arguments and a cursor from the same query.'],
  RATE_LIMITED: ['Too many school requests.', 'Wait at least sixty seconds before trying again.'],
  SESSION_REQUIRED: ['The school session needs attention.', 'Reconnect this account in VStudy.'],
  DISCONNECTED: ['The school could not be reached.', 'Read synced content offline or try again later. Do not repeat uncertain writes.'],
  ACADEMIC_INTEGRITY: ['Agents cannot complete this activity.', 'Open the activity in VStudy and complete it yourself.'],
  EXPIRED: ['This prepared action has already been used.', 'Create a new proposal for approval.'],
  INTERNAL: ['VStudy could not finish the operation.', 'Check the item in VStudy before proposing the action again.'],
};

/** The security engine may inspect code and hint, but must never forward arbitrary exceptions. */
export class McpBackendError extends Error {
  readonly hint: string;
  constructor(readonly code: McpErrorCode) {
    const [message, hint] = failures[code] ?? failures.INTERNAL!;
    super(message);
    this.name = 'McpBackendError';
    this.hint = hint;
  }
}

export function fail(code: McpErrorCode): never { throw new McpBackendError(code); }

export async function backendBoundary<T>(work: () => T | Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof McpBackendError) throw error;
    if (error instanceof MoodleError) {
      const codes = {auth:'SESSION_REQUIRED', permission:'DENIED', unsupported:'UNSUPPORTED', network:'DISCONNECTED', service:'UNSUPPORTED'} as const;
      fail(codes[error.kind]);
    }
    fail('INTERNAL');
  }
}

export function available<T>(lookup: () => T): T {
  try { return lookup(); }
  catch (error) { if (error instanceof McpBackendError) throw error; fail('NOT_FOUND'); }
}
