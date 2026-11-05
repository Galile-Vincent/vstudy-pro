/**
 * Redact secrets from diagnostics and map internal failures to public errors.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { homedir } from 'node:os';
/** Remove credential-shaped values before diagnostics reach logs. */
export function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value);
  return (text ?? '').split(homedir()).join('~')
    .replace(/sk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/(Bearer\s+)[^\s"',}]+/gi, '$1[redacted]')
    .replace(/(x-api-key["'\s]*[:=]["'\s]*)[^\s"',}]+/gi, '$1[redacted]');
}
/** Write a structured diagnostic after redacting sensitive values. */
export function log(value: unknown): void { console.log(redact(value)); }
/** Return a stable public failure label without exposing internal diagnostics. */
export function publicError(): string { return 'The operation failed. Please retry.'; }
