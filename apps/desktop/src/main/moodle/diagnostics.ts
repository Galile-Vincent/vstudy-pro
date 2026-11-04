import type { z } from 'zod';

export function issueDiagnostics(issues: z.ZodIssue[], prefix: (string | number)[] = []) {
  return issues.slice(0,10).map(issue => ({path:[...prefix,...issue.path].join('.'),code:issue.code,...(issue.code === 'invalid_type' ? {expected:issue.expected,received:issue.received} : {})}));
}
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
export function diagnosticIdentifier(value: string | null | undefined) {
  return value && /^[a-zA-Z_\\][a-zA-Z0-9_\\]{0,99}$/.test(value) ? value : undefined;
}
