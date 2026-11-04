import { homedir } from 'node:os';
export function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value);
  return (text ?? '').split(homedir()).join('~')
    .replace(/sk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/(Bearer\s+)[^\s"',}]+/gi, '$1[redacted]')
    .replace(/(x-api-key["'\s]*[:=]["'\s]*)[^\s"',}]+/gi, '$1[redacted]');
}
export function log(value: unknown): void { console.log(redact(value)); }
export function publicError(): string { return 'The operation failed. Please retry.'; }
