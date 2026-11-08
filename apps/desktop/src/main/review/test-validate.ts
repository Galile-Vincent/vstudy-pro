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
    kind?: string;
}
/** Supply the whole blueprint counts for quiz generation; omit for citation-only checks. */
export interface TestBalanceContext {
    acceptedItems: readonly StudyTest['items'][number][];
    plannedMcqCount: number;
    plannedTrueFalseCount: number;
}
export function validateTest(raw: unknown, excerpts: readonly Excerpt[], excludedStems: readonly string[] = [], balance?: TestBalanceContext) {
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
            valid = item.source.quote.length <= 240 && input.version === 1 && !!source && !/^(?:assignment|exam)$/i.test(source.kind ?? '') && quoteText(item.source.quote).length > 0 && quoteText(source.text).includes(quoteText(item.source.quote)) && !seen.has(normalizeStem(item.stem)) && !seen.has(stemHash(item.stem)) && !items.some(i => i.id === item.id) && !/以上皆是|以上皆非|以上皆正確|以上皆正|皆正確|都對|皆非|all of the above|none of the above|both [a-d] and [a-d]/i.test([item.stem, ...(item.type === 'mcq' ? item.options : [])].join(' '));
            if(item.type==='multi_select')valid=valid&&item.answer.every(a=>a<item.options.length)&&new Set(item.options.map(normalizeStem)).size===item.options.length;
            if (item.type === 'mcq') {
                const lens = item.options.map(s => Array.from(s.trim()).length);
                valid = valid && item.options.length === 4 && !(lens[item.answer] === Math.max(...lens) && lens.filter(n => n === lens[item.answer]).length === 1) && item.answer < item.options.length && new Set(item.options.map(normalizeStem)).size === item.options.length && Math.max(...lens) / Math.min(...lens) <= 2;
            }
            if (valid) {
                items.push(item);
                seen.add(normalizeStem(item.stem));
            }
        }
        if (!valid)
            warnings.push(`Dropped item ${index + 1}: structure or source check failed`);
    }
    if (balance) {
        const accepted = [...balance.acceptedItems];
        for (let i = 0; i < items.length;) {
            const item = items[i]!;
            const mcqLimit = Math.max(1, Math.floor(balance.plannedMcqCount * 0.4));
            const tfLimit = Math.ceil(balance.plannedTrueFalseCount / 2);
            const reason = item.type === 'mcq' && balance.plannedMcqCount >= 4 &&
                accepted.filter(other => other.type === 'mcq' && other.answer === item.answer).length >= mcqLimit ? 'answer-position bias' :
                item.type === 'true_false' && balance.plannedTrueFalseCount >= 4 &&
                accepted.filter(other => other.type === 'true_false' && other.answer === item.answer).length >= tfLimit ? 'true/false skew' : null;
            if (reason) {
                warnings.push(`Dropped item ${item.id}: ${reason}`);
                items.splice(i, 1);
            } else { accepted.push(item); i++; }
        }
    }
    return { version: 1 as const, items, warnings };
}
