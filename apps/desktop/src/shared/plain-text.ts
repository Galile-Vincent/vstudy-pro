/**
 * Reduce untrusted content to bounded plain text for labels and diagnostics.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import type { DocumentCitation } from './domain';
/** Strip markup and bound untrusted text before displaying or logging it. */
export function plainText(markdown: string, citations: DocumentCitation[] = []): string {
  const source = markdown.replace(/\[\[cite:(s\d+)\]\]/g, (_token, id: string) => {
    const citation = citations.find(c => c.id === id);
    return citation ? citation.page ? `p. ${citation.page}` : citation.title : '';
  });
  const text = (node: Nodes): string => {
    if (node.type === 'html') return '';
    if ('value' in node) return node.value;
    if (node.type === 'image') return node.alt ?? '';
    if ('children' in node) return node.children.map(text).join(['root','list','listItem','blockquote'].includes(node.type) ? ' ' : '');
    return '';
  };
  return text(unified().use(remarkParse).parse(source)).replace(/\s+/g,' ').trim();
}
