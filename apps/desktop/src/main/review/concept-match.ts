/** Unicode-safe deterministic catalog matching. @packageDocumentation */
export const normalizeText = (value:string):string => value.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');
export const conceptKey = (value:string):string => normalizeText(value).replace(/[^\p{L}\p{N}\p{M}]+/gu,' ').trim();
export interface ConceptCandidate {key:string;label:string;aliases?:readonly string[]}
export function matchConcept<T extends ConceptCandidate>(label:string, catalog:readonly T[]):T | undefined {
  const key = conceptKey(label);
  if (!key) return undefined;
  return catalog.find(row => [row.key,row.label,...(row.aliases ?? [])].some(alias=>conceptKey(alias)===key));
}
export function containsAlias(text:string, alias:string):boolean {
  const haystack = normalizeText(text), needle = normalizeText(alias);
  if (!needle) return false;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(needle)) return haystack.includes(needle);
  let offset = haystack.indexOf(needle);
  while (offset >= 0) {
    const before = [...haystack.slice(0,offset)].at(-1) ?? '';
    const after = [...haystack.slice(offset+needle.length)][0] ?? '';
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    offset = haystack.indexOf(needle,offset+1);
  }
  return false;
}
