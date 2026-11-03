import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent } from 'mdast';
export function pageTokens(text:string):string[] {
 return text.normalize('NFKC').toLowerCase().replace(/\\[a-z]+/gi,' ').replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,' $1 ').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+/gu) ?? [];
}
export function validateAiPage(source:string, output:string):{accepted:boolean; missing:number; added:number} {
 if (!output.trim() || Buffer.byteLength(output)>256*1024) throw new Error('ai_parse.size');
 const tree:Root = unified().use(remarkParse).use(remarkGfm).parse(output);
 function visit(node:Root|RootContent):void {
  if(node.type==='html' || node.type==='image' || node.type==='imageReference') throw new Error('ai_parse.active_content');
  if ((node.type==='link' || node.type==='definition') && !/^(https?:|mailto:)/i.test(node.url)) throw new Error('ai_parse.active_content');
  if('children' in node) for(const child of node.children) visit(child);
 }
 visit(tree);
 const input=pageTokens(source), result=pageTokens(output);
 if(!input.length) return {accepted:false,missing:1,added:1};
 const counts=(tokens:string[])=>{const m=new Map<string,number>();for(const t of tokens)m.set(t,(m.get(t)??0)+1);return m;};
 const a=counts(input),b=counts(result);
 let overlap=0;for(const [token,n] of a) overlap+=Math.min(n,b.get(token)??0);
 const missing=(input.length-overlap)/input.length, added=(result.length-overlap)/Math.max(1,result.length);
 return {accepted:missing<=.08 && added<=.25,missing,added};
}
export function splitParsePages(markdown:string):string[] {
 const parts=markdown.split(/<!--\s*page\s+\d+\s*-->/i);
 return parts.length===1 ? parts : parts.slice(1).map((p,i)=>i===0 && parts[0]?.trim() ? `${parts[0]}\n${p}` : p);
}
