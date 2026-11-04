import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import type { DocumentCitation } from './domain';
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
