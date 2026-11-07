/**
 * Map conversion diagnostics to localized, user-facing error identifiers.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import type { Status } from './status';
/** Map structured conversion failures to stable localized error codes. */
export function importError(error: unknown): Status {
  const message = error instanceof Error ? error.message : String(error);
  const holder = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const errno = String(holder?.code ?? holder?.cause?.code ?? '');
  const code = errno === 'ENOSPC' || /ENOSPC/.test(message) ? 'disk_full'
    : ['EACCES', 'EPERM', 'EROFS'].includes(errno) || /EACCES|EPERM|EROFS/.test(message) ? 'permission_denied'
    : ['ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN'].includes(errno) ? 'offline'
    : /empty|zero.byte/i.test(message) ? 'empty_file'
    : /50 MiB|too large/i.test(message) ? 'file_too_large'
    : /Unsupported document type/.test(message) ? 'unsupported_type'
    : /ZIP|archive|Symlink|regular file/.test(message) ? 'unsafe_archive'
    : /signature|Executable|content mismatch/.test(message) ? 'type_mismatch'
    : /UTF-8|encoding/.test(message) ? 'text_encoding'
    : /NO_TEXT_LAYER|no text layer|OCR/.test(message) ? 'pdf_no_text'
    : 'generic';
  return {code:`errors.${code}`,params:code === 'file_too_large' ? {limit:50} : code === 'text_encoding' ? {encoding:/Text encoding: ([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? 'unknown'} : {}};
}
