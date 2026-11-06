import { createHash } from 'node:crypto';
import { studyTestItemSchema, type StudyTest } from '../../shared/review-artifacts';
export const REVIEW_VALIDATION_NOTICE = 'checked for structure and sources, not guaranteed correct';
export const normalizeStem = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
export const stemHash = (s: string) => createHash('sha256').update(normalizeStem(s)).digest('hex');
const quoteText = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
export interface Excerpt {
    documentId: string;
    version: 'original' | 'ai';
    excerptHash: string;
    text: string;
    truncated?: boolean;
}
export function validateTest(raw: unknown, excerpts: readonly Excerpt[], excludedStems: readonly string[] = []) {
    const input = raw as {
        version?: unknown;
        items?: unknown[];
    };
    const items: StudyTest['items'] = [], warnings: string[] = [];
    const seen = new Set(excludedStems.map(normalizeStem));
    for (const [index, value] of (Array.isArray(input?.items) ? input.items.slice(0, 100) : []).entries()) {
        const parsed = studyTestItemSchema.safeParse(value);
        let valid = parsed.success;
        if (parsed.success) {
            const item = parsed.data;
            const source = excerpts.find(e => e.documentId === item.source.documentId && e.version === item.source.version && e.excerptHash === item.source.excerptHash);
            valid = item.source.quote.length <= 240 && input.version === 1 && !!source && quoteText(item.source.quote).length > 0 && quoteText(source.text).includes(quoteText(item.source.quote)) && !seen.has(normalizeStem(item.stem)) && !seen.has(stemHash(item.stem)) && !items.some(i => i.id === item.id) && !/以上皆是|以上皆非|皆非|all of the above|none of the above|both a and b/i.test([item.stem, ...(item.type === 'mcq' ? item.options : [])].join(' '));
            if (item.type === 'mcq') {
                const lens = item.options.map(s => Array.from(s.trim()).length);
                valid = valid && item.answer < item.options.length && new Set(item.options.map(normalizeStem)).size === item.options.length && Math.max(...lens) / Math.min(...lens) <= 2;
            }
            if (valid) {
                items.push(item);
                seen.add(normalizeStem(item.stem));
            }
        }
        if (!valid)
            warnings.push(`Dropped item ${index + 1}: structure or source check failed`);
    }
    return { version: 1 as const, items, warnings };
}
