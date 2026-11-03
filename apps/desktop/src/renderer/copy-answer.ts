import type { DocumentCitation } from '../shared';
export function copyAnswer(text: string, citations: DocumentCitation[]): string {
  return text.replace(/\[\[cite:(s\d+)\]\]/g, (_token, id: string) => {
    const citation = citations.find(c => c.id === id);
    return citation ? citation.page ? `p. ${citation.page}` : citation.title : _token;
  });
}
