/**
 * Redact secrets from diagnostics and map internal failures to public errors.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { app, clipboard } from 'electron';
import { release } from 'node:os';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** Remove credential-shaped values before diagnostics reach logs. */
export function redact(value: unknown): string {
  let text: string;
  try {
    text = value instanceof Error ? value.stack ?? value.message : typeof value === 'string' ? value : JSON.stringify(value, (_key, item: unknown) => item instanceof Error ? item.stack ?? item.message : item) ?? '';
  } catch { return '[unserializable diagnostic]'; }
  return text.slice(0, 20_000)
    .replace(/\bsk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/\b(?:AIza[\w-]{20,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{12,}|xox[abprs]-[\w-]{10,})/g, '[redacted]')
    .replace(/((?:cookie|set-cookie)["'\s]*:\s*["']?)[^"'\r\n}]+/gi, '$1[redacted]')
    .replace(/((?:proxy-)?authorization["'\s]*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^&\r\n}]+)/gi, '$1[redacted]')
    .replace(/((?:Basic|Bearer|Digest|Negotiate)(?:\s+|%20|\+))[^\s"'&,}]+/gi, '$1[redacted]')
    .replace(/((?:x-api-key|api[_-]?key|token|sesskey|private[_-]?key|passw(?:or)?d|(?:client[_-])?secret)["'\s]*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^&"'\r\n,}]+)/gi, '$1[redacted]')
    .replace(/((?<![a-z0-9_-])key["'\s]*[:=]\s*)(["']?)([a-z0-9_-]{12,})(?![a-z0-9_-])/gi, '$1$2[redacted]')
    .replace(/(["'])(?:[a-z]:[\\/]+|\\\\|~?\/)[^"'\r\n]*\1/gi, '$1[path]$1')
    .replace(/(?:[a-z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/|~\/)[^"'\r\n<>|)]+/gi, '[path]')
    .replace(/[a-z]:[\\/]+[^\s"'<>|)]+|(?:~|file:\/\/)?\/[^\s"'<>|)]+/gi, path => /^\/v\d+(?:\/[a-z0-9_-]+)+$/i.test(path) ? path : '[path]')
    .replace(/[\p{L}\p{N}_.-]+/gu, token => /\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|json|db|sqlite|log|[cm]?js|tsx?|png|jpe?g|zip)\b/i.test(token) ? '[file]' : token);
}
const maxBytes = 1024 * 1024;
const recent: string[] = [];
function logPath(): string { return join(app.getPath('userData'), 'logs', 'main.log'); }
/** Write one bounded, redacted record; diagnostics must never break application work. */
export function log(value: unknown): void {
  const line = `${new Date().toISOString()} ${redact(value).replace(/[\r\n]/g, '\\n').slice(0, 8000)}`;
  recent.push(line);
  if (recent.length > 100) recent.shift();
  console.log(line);
  try {
    const path = logPath();
    mkdirSync(join(app.getPath('userData'), 'logs'), {recursive:true, mode:0o700});
    let size = 0;
    try { size = statSync(path).size; } catch { /* The first record creates the log. */ }
    if (size + Buffer.byteLength(line + '\n') > maxBytes) {
      try {
        rmSync(path + '.1', {force:true});
        renameSync(path, path + '.1');
      } catch {
        // A locked rotation target must not prevent subsequent records.
        writeFileSync(path, '', {mode:0o600});
      }
    }
    appendFileSync(path, line + '\n', {mode:0o600});
  } catch { /* Retain recent records in memory when the disk is unavailable. */ }
}

/** Return a stable public failure label without exposing internal diagnostics. */
export function publicError(): string { return 'The operation failed. Please retry.'; }

/** Copy only application/runtime metadata and redacted diagnostic records. */
export function copyDiagnostics(): void {
  let lines: string[] = [];
  try {
    const path = logPath();
    for (const file of [path + '.1', path]) {
      try { lines.push(...readFileSync(file, 'utf8').split('\n').filter(Boolean)); } catch { /* Rotation may not exist yet. */ }
    }
  } catch { /* The file sink may be unavailable before startup. */ }
  if (!lines.length) lines = recent;
  clipboard.writeText(`VStudy Pro ${app.getVersion()}\nOS ${process.platform} ${release()}\nArch ${process.arch}\n${lines.slice(-100).map(redact).join('\n')}`);
}
