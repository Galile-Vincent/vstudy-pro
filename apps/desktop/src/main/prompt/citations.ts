import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import { documentCitationSchema, type DocumentCitation, type Document } from '../../shared/domain';

export function citationCatalog(documentId: Document['id'], markdown: string): DocumentCitation[] {
  const candidates: DocumentCitation[] = [];
  let page: number | undefined;
  const text = (node: Nodes): string => 'value' in node ? node.value : 'children' in node ? node.children.map(text).join('') : '';
  const visit = (node: Nodes) => {
    const offset = node.position?.start.offset ?? 0;
    if (node.type === 'html') {
      const match = node.value.match(/<!-- page (\d+) -->/);
      if (match) page = Number(match[1]);
    }
    if (node.type === 'heading') candidates.push(documentCitationSchema.parse({ id:`s${offset}`,documentId,offset,title:text(node).slice(0,300),quote:markdown.slice(offset,offset+300),...(page ? {page} : {}) }));
    if ('children' in node) node.children.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(markdown));
  if (!candidates.length) candidates.push({id:'s0',documentId,offset:0,title:'Document',quote:markdown.slice(0,300)});
  return candidates.slice(0,80);
}
export function citedReferences(answer: string, catalog: DocumentCitation[]): DocumentCitation[] {
  const ids = new Set(Array.from(answer.matchAll(/\[\[cite:(s\d+)\]\]/g),m => m[1]));
  return catalog.filter(reference => ids.has(reference.id)).slice(0,128);
}
