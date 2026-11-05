/**
 * Create source-offset citation catalogs and resolve references from model output.
 * Owned by main/prompt.
 * Document and course content is untrusted data, never application instructions.
 * @packageDocumentation
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import { documentCitationSchema, type DocumentCitation, type Document } from '../../shared/domain';

/** Create citation identifiers and source offsets from the selected document version. */
export function citationCatalog(documentId: Document['id'], markdown: string): DocumentCitation[] {
  if (!markdown.trim()) return [];
  const candidates: DocumentCitation[] = [];
  let page: number | undefined;
  const pages: DocumentCitation[] = [];
  const text = (node: Nodes): string => 'value' in node ? node.value : 'children' in node ? node.children.map(text).join('') : '';
  const visit = (node: Nodes) => {
    const offset = node.position?.start.offset ?? 0;
    if (node.type === 'html') {
      const match = node.value.match(/<!-- page (\d+) -->/);
      if (match) {const value=Number(match[1]);page=Number.isSafeInteger(value) && value > 0 ? value : undefined;
        if (page) { const start = markdown.slice(offset + node.value.length).search(/\S/); const target = offset + node.value.length + Math.max(0,start); pages.push({id:`s${target}`,documentId,offset:target,page,title:`p. ${page}`,quote:markdown.slice(offset + node.value.length, offset + node.value.length + 300).trim()}); }
      }
    }
    if (node.type === 'heading') candidates.push(documentCitationSchema.parse({ id:`s${offset}`,documentId,offset,title:text(node).slice(0,300) || 'Untitled section',quote:markdown.slice(offset,offset+300),...(page ? {page} : {}) }));
    if ('children' in node) node.children.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(markdown));
  for (const entry of pages) if (!candidates.some(c => c.page === entry.page)) candidates.push(entry);
  candidates.sort((a,b) => a.offset - b.offset);
  if (!candidates.length) candidates.push({id:'s0',documentId,offset:0,title:'Document',quote:markdown.slice(0,300)});
  return candidates;
}
/** Resolve only references that exist in the supplied document citation catalog. */
export function citedReferences(answer: string, catalog: DocumentCitation[]): DocumentCitation[] {
  const ids = new Set(Array.from(answer.matchAll(/\[\[cite:(s\d+)\]\]/g),m => m[1]));
  return catalog.filter(reference => ids.has(reference.id)).slice(0,128);
}
