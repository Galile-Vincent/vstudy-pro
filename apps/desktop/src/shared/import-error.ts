/**
 * Map conversion diagnostics to localized, user-facing error identifiers.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import type { Status } from './status';
const MAX_CAUSE_DEPTH = 5;
type Holder = { code?: unknown; errcode?: unknown; cause?: unknown; errors?: unknown };
function* walk(error: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  const queue: Array<[unknown, number]> = [[error, 0]];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [node, depth] = next;
    if (typeof node === 'object' && node !== null) {
      if (seen.has(node)) continue;
      seen.add(node);
    }
    yield node;
    if (typeof node !== 'object' || node === null || depth >= MAX_CAUSE_DEPTH) continue;
    const holder = node as Holder;
    if (holder.cause !== undefined) queue.push([holder.cause, depth + 1]);
    if (Array.isArray(holder.errors)) for (const member of holder.errors) queue.push([member, depth + 1]);
  }
}
function systemCode(node: unknown): 'disk_full' | 'permission_denied' | 'offline' | null {
  const message = node instanceof Error ? node.message : typeof node === 'string' ? node : typeof (node as { message?: unknown } | null)?.message === 'string' ? (node as { message: string }).message : '';
  const holder = (typeof node === 'object' ? node : null) as Holder | null;
  const errno = String(holder?.code ?? '');
  const sqliteFull = errno === 'SQLITE_FULL' || (errno === 'ERR_SQLITE_ERROR' && (Number(holder?.errcode) & 0xff) === 13) || /database or disk is full/i.test(message);
  if (errno === 'ENOSPC' || errno === 'EDQUOT' || sqliteFull || /ENOSPC|EDQUOT/.test(message)) return 'disk_full';
  if (['EACCES', 'EPERM', 'EROFS'].includes(errno) || /EACCES|EPERM|EROFS/.test(message)) return 'permission_denied';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN'].includes(errno) || /ENOTFOUND|ECONNRESET/.test(message)) return 'offline';
  return null;
}
/** Map structured conversion failures to stable localized error codes. */
export function importError(error: unknown): Status {
  const message = error instanceof Error ? error.message : String(error);
  let system: ReturnType<typeof systemCode> = null;
  for (const node of walk(error)) if ((system = systemCode(node))) break;
  const code = system
    ?? (/empty|zero.byte/i.test(message) ? 'empty_file'
    : /50 MiB|too large/i.test(message) ? 'file_too_large'
    : /Unsupported document type/.test(message) ? 'unsupported_type'
    : /ZIP|archive|Symlink|regular file/.test(message) ? 'unsafe_archive'
    : /signature|Executable|content mismatch/.test(message) ? 'type_mismatch'
    : /UTF-8|encoding/.test(message) ? 'text_encoding'
    : /NO_TEXT_LAYER|no text layer|OCR/.test(message) ? 'pdf_no_text'
    : 'generic');
  return {code:`errors.${code}`,params:code === 'file_too_large' ? {limit:50} : code === 'text_encoding' ? {encoding:/Text encoding: ([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? 'unknown'} : {}};
}
