import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { documentIdSchema } from '../../shared/domain';
export class SearchService {
 constructor(private readonly db:DatabaseSync) {}
 update(id:string, content:string) {
  const d=this.db.prepare('SELECT title,sourceName FROM documents WHERE id=? AND deletedAt IS NULL').get(id);
  this.db.exec('SAVEPOINT search_update');
  try {
   this.db.prepare('DELETE FROM document_fts WHERE documentId=?').run(id);
   if(d) this.db.prepare('INSERT INTO document_fts(documentId,title,filename,content) VALUES(?,?,?,?)').run(id,String(d.title),String(d.sourceName),content);
   this.db.exec('RELEASE search_update');
  } catch(e){this.db.exec('ROLLBACK TO search_update; RELEASE search_update');throw e;}
 }
 rebuild() {
  const missing=this.db.prepare("SELECT id,markdownPath FROM documents WHERE status='ready' AND deletedAt IS NULL AND id NOT IN(SELECT documentId FROM document_fts)").all();
  for(const d of missing) { try {this.update(String(d.id),readFileSync(String(d.markdownPath),'utf8'));} catch { /* A missing source is retried on the next startup. */ } }
 }
 search(text:string,limit=50,cursor?:{rank:number;id:string}) {
  const q=text.trim(); if(!q || q.length>200) throw new Error('Invalid search query');
  const started=performance.now();
  // Trigram preserves literal substrings across zh-Hant/ja/en. Two-character fixtures
  // (資料/通信/学習/網路) need LIKE: trigram MATCH has no token below 3 codepoints.
  // Bigram unicode61 needs synthetic token/offset mapping and loses native snippets.
  const short=[...q].length<3;
  const match='"'+q.replaceAll('"','""')+'"';
  const literal='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const args=short?[literal,literal,literal]:[match];
  const where=short?"(f.title LIKE ? ESCAPE '\\' OR f.filename LIKE ? ESCAPE '\\' OR f.content LIKE ? ESCAPE '\\')":'document_fts MATCH ?';
  const rank=short?'0':'bm25(document_fts,0,8,4,1)';
  const snippet=short?'substr(f.content,1,240)':"snippet(document_fts,3,'[mark]','[/mark]',' … ',32)";
  const rows=this.db.prepare(`SELECT f.documentId,f.title,${snippet} AS snippet,${rank} AS rank FROM document_fts f JOIN documents d ON d.id=f.documentId WHERE d.deletedAt IS NULL AND ${where} ORDER BY rank,f.documentId LIMIT 5001`).all(...args);
  if(performance.now()-started>80) throw new Error('Search time budget exceeded');
  const eligible=rows.filter(r=>!cursor || Number(r.rank)>cursor.rank || (Number(r.rank)===cursor.rank && String(r.documentId)>cursor.id));
  const items=eligible.slice(0,limit).map(r=>({documentId:documentIdSchema.parse(r.documentId),title:String(r.title),snippet:short?String(r.snippet).replaceAll(q,`[mark]${q}[/mark]`):String(r.snippet),rank:Number(r.rank)}));
  const last=items.at(-1);
  return {items,nextCursor:eligible.length>limit&&last?{rank:last.rank,id:last.documentId}:null};
 }
}
