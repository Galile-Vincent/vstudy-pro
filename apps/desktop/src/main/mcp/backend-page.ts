/** Authenticate query-bound cursors and cap every page before it reaches the bridge. @packageDocumentation */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { decodeHtmlEntities } from '../../shared/html';
import { fail } from './backend-errors';

export const MAX_PAGE_BYTES = 48_000;
export const MAX_TEXT_CHARS = 6_000;

/** Convert external HTML or Markdown to inert text and remove network and local path references. */
export function contentText(value: string, cap = 2_000): string {
  return decodeHtmlEntities(value
    .replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi, '$1')
    .replace(/<[^>]*>/g, ' '))
    .replace(/(?:https?:\/\/|file:\/\/|data:|javascript:)[^\s<>"'\])]+/gi, '[link removed]')
    .replace(/\p{Cc}/gu, character => character === '\n' || character === '\t' ? character : '')
    .slice(0, cap);
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const cursorSchema = z.object({v:z.literal(1), binding:z.string(), offset:z.number().int().min(0).max(8 * 1024 * 1024)}).strict();

export class BackendPages {
  private readonly key = randomBytes(32);
  binding(name: string, account: string | null, args: object): string {
    const query = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'cursor'));
    return createHash('sha256').update(JSON.stringify(canonical({name, account, query}))).digest('hex');
  }
  private encode(binding: string, offset: number): string {
    const data = Buffer.from(JSON.stringify({v:1, binding, offset})).toString('base64url');
    return data + '.' + createHmac('sha256', this.key).update(data).digest('base64url');
  }
  next(binding: string, offset: number): string { return this.encode(binding, offset); }
  offset(binding: string, cursor?: string): number {
    if (!cursor) return 0;
    const [data, mac, extra] = cursor.split('.');
    if (!data || !mac || extra || cursor.length > 2048) fail('INVALID_ARGUMENT');
    const expected = createHmac('sha256', this.key).update(data).digest();
    const actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('INVALID_ARGUMENT');
    try {
      const parsed = cursorSchema.parse(JSON.parse(Buffer.from(data, 'base64url').toString('utf8')));
      if (parsed.binding !== binding) fail('INVALID_ARGUMENT');
      return parsed.offset;
    } catch { fail('INVALID_ARGUMENT'); }
  }
  page<T>(rows: readonly T[], binding: string, args: {cursor?:string | undefined; limit:number}) {
    binding = createHash('sha256').update(binding).update(JSON.stringify(rows)).digest('hex');
    const start = this.offset(binding, args.cursor);
    const items: T[] = [];
    let bytes = 0;
    for (const item of rows.slice(start, start + Math.min(50, args.limit))) {
      const size = Buffer.byteLength(JSON.stringify(item));
      if (bytes + size > MAX_PAGE_BYTES) { if (!items.length) fail('UNSUPPORTED'); break; }
      bytes += size;
      items.push(item);
    }
    const next = start + items.length;
    return {content:{items}, nextCursor:next < rows.length ? this.encode(binding, next) : null};
  }
  text(text: string, binding: string, args: {cursor?:string | undefined; limit:number}) {
    binding = createHash('sha256').update(binding).update(text).digest('hex');
    const offset = this.offset(binding, args.cursor);
    const value = text.slice(offset, offset + Math.min(MAX_TEXT_CHARS, args.limit * 1000));
    return {content:{text:value, offset}, nextCursor:offset + value.length < text.length ? this.encode(binding, offset + value.length) : null};
  }
}
