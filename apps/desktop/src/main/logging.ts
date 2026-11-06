/**
 * Redact secrets from diagnostics and map internal failures to public errors.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { app, clipboard } from 'electron';
import { release } from 'node:os';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
/** Remove credential-shaped values before diagnostics reach logs. */
export function redact(value: unknown): string {
  let text: string;
  try {
    text = value instanceof Error ? value.stack ?? value.message : typeof value === 'string' ? value : JSON.stringify(value, (_key, item: unknown) => item instanceof Error ? item.stack ?? item.message : item) ?? '';
  } catch { return '[unserializable diagnostic]'; }
  return text
    .replace(/sk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/(Bearer\s+)[^\s"',}]+/gi, '$1[redacted]')
    .replace(/((?:x-api-key|api[_-]?key|token|password)["'\s]*[:=]["'\s]*)[^\s"',}]+/gi, '$1[redacted]')
    .replace(/(["'])(?:[a-z]:[\\/]+|\\\\|~?\/)[^"'\r\n]*\1/gi, '$1[path]$1')
    .replace(/(["'])[^"'\r\n]*\.[a-z0-9]{1,10}\1/gi, '$1[file]$1')
    .replace(/[a-z]:[\\/]+[^\s"'<>|)]+|(?:~|file:\/\/)?\/[^\s"'<>|)]+/gi, '[path]')
    .replace(/(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+/gu, '[file]');
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
      rmSync(path + '.1', {force:true});
      renameSync(path, path + '.1');
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
