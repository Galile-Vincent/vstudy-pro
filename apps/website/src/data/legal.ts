/** Terms of Service and Privacy Policy. Each language supplies one pack with identical structure; the build fails if they drift. */
import { CONTACT_EMAIL, GOVERNING_LAW, ownerValue, REPO_URL, path } from '../config';
import type { Language } from './ui';
import { legalEn } from './legal-en';
import { legalJa } from './legal-ja';
import { legalZhHant } from './legal-zh-Hant';

export type LegalSlug = 'terms' | 'privacy';
export const legalSlugs: LegalSlug[] = ['terms', 'privacy'];

/** Inline markup in every string: [[owner-confirm]], **strong**, `code`, [label](url or @route), {{email}}, {{law}}. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'summary'; items: string[] }
  | { type: 'table'; caption: string; head: string[]; rows: string[][] };
export interface LegalSection { id: string; title: string; blocks: Block[]; }
export interface LegalDoc { title: string; description: string; lead: string; sections: LegalSection[]; }
export interface LegalChrome { updated: string; toc: string; related: Record<LegalSlug, string>; emailTodo: string; lawTodo: string; }
export interface LegalPack { chrome: LegalChrome; docs: Record<LegalSlug, LegalDoc>; }

const packs: Record<Language, LegalPack> = { en: legalEn, 'zh-Hant': legalZhHant, ja: legalJa };

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'code' | 'todo'; text: string }
  | { kind: 'link'; text: string; target: string }
  | { kind: 'email' | 'law' };
const inline = /\[\[(.+?)\]\]|\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\{\{(email|law)\}\}/g;
export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(inline)) {
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ kind: 'todo', text: match[1] });
    else if (match[2] !== undefined) out.push({ kind: 'strong', text: match[2] });
    else if (match[3] !== undefined) out.push({ kind: 'code', text: match[3] });
    else if (match[4] !== undefined) out.push({ kind: 'link', text: match[4], target: match[5]! });
    else out.push({ kind: match[6] as 'email' | 'law' });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const routes = { privacy: 'privacy/', terms: 'terms/', 'docs-privacy': 'docs/privacy-and-network/' };
export function resolveTarget(target: string, language: Language): string {
  if (!target.startsWith('@')) return target;
  const name = target.slice(1);
  if (name === 'repo') return REPO_URL;
  if (name === 'issues') return `${REPO_URL}/issues`;
  if (name === 'security') return `${REPO_URL}/blob/main/docs/SECURITY.md`;
  if (name === 'mail') return `mailto:${ownerValue(CONTACT_EMAIL) ?? ''}`;
  if (name in routes) return path(`${language}/${routes[name as keyof typeof routes]}`);
  throw new Error(`Unknown legal link target ${target}`);
}
export const owner = { email: ownerValue(CONTACT_EMAIL), law: ownerValue(GOVERNING_LAW) };

function shape(doc: LegalDoc) {
  const marks = (text: string) => parseInline(text).filter(part => part.kind === 'todo' || part.kind === 'link' || part.kind === 'email' || part.kind === 'law').map(part => part.kind === 'link' ? `link:${part.target}` : part.kind);
  return doc.sections.map(section => [section.id, ...section.blocks.map(block => {
    const strings = block.type === 'p' || block.type === 'h3' ? [block.text] : block.type === 'table' ? [block.caption, ...block.head, ...block.rows.flat()] : block.items;
    const size = block.type === 'table' ? `${block.head.length}x${block.rows.length}` : 'items' in block ? block.items.length : 0;
    return `${block.type}:${size}:${strings.flatMap(marks).join('|')}`;
  })].join(' / '));
}
for (const slug of legalSlugs) {
  const expected = shape(packs.en.docs[slug]);
  for (const language of Object.keys(packs) as Language[]) {
    const actual = shape(packs[language].docs[slug]);
    const index = expected.findIndex((line, i) => line !== actual[i]);
    if (actual.length !== expected.length || index >= 0) throw new Error(`Legal pack ${language}/${slug} differs from English at section ${index >= 0 ? expected[index]!.split(' / ')[0] : 'count'}`);
  }
}

export const getLegal = (slug: LegalSlug, language: Language) => ({ chrome: packs[language].chrome, doc: packs[language].docs[slug] });
export const legalTitle = (slug: LegalSlug, language: Language) => packs[language].docs[slug].title;
