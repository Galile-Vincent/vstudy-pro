/**
 * Describe response shapes and service failures without recording sensitive values.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import type { z } from 'zod';

/** Return structured capability failures without sensitive response values. */
export function issueDiagnostics(issues: z.ZodIssue[], prefix: (string | number)[] = []) {
  return issues.slice(0,10).map(issue => ({path:[...prefix,...issue.path].join('.'),code:issue.code,...(issue.code === 'invalid_type' ? {expected:issue.expected,received:issue.received} : {})}));
}
/** Describe field shapes only; omit values that may contain student data or credentials. */
export function responseShape(raw: unknown): string | undefined {
  if (process.env.MOODLE_DEBUG_SHAPES !== '1') return undefined;
  let remaining = 120;
  const shape = (value: unknown, depth: number): unknown => {
    if (--remaining < 0 || depth > 8) return 'truncated';
    if (value === null) return 'null';
    if (Array.isArray(value)) return {type:'array',length:value.length,items:value.slice(0,3).map(item => shape(item,depth+1))};
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0,40).map(([key,item]) => [/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key) ? key : '[key]',shape(item,depth+1)]));
    return typeof value;
  };
  return Buffer.from(JSON.stringify(shape(raw,0))).subarray(0,4096).toString('utf8');
}
/** Reduce a remote identifier to a bounded diagnostic label. */
export function diagnosticIdentifier(value: string | null | undefined) {
  return value && /^[a-zA-Z_\\][a-zA-Z0-9_\\]{0,99}$/.test(value) ? value : undefined;
}
