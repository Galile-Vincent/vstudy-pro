/**
 * Index document text and perform literal multilingual FTS queries.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { containedPath } from "./file-paths";
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { documentIdSchema } from '../../shared/domain';
/** Normalize Markdown text for literal FTS indexing without trusting embedded markup. */
export function indexedText(content: string): string {
    return content.slice(0, 1_000_000).replace(/(.)\1{63,}/gs, '$1'.repeat(32));
}
/** Reject oversized or empty queries before building a literal FTS expression. */
export function validateSearchQuery(text: string): string {
    const q = text.trim();
    if ([...q].length < 2 || q.length > 200 || new Set(q.toLocaleLowerCase()).size < 2) throw new Error('Refine your query: use at least two distinct characters');
    return q;
}
/** Index and search literal document text with bounded result pagination. */
export class SearchService {
    constructor(private readonly db: DatabaseSync, private readonly root?: string) { }
    update(id: string, content: string) {
        const d = this.db.prepare('SELECT title,sourceName FROM documents WHERE id=? AND deletedAt IS NULL').get(id);
        this.db.exec('SAVEPOINT search_update');
        try {
            this.db.prepare('DELETE FROM document_fts WHERE documentId=?').run(id);
            if (d)
                this.db.prepare('INSERT INTO document_fts(documentId,title,filename,content) VALUES(?,?,?,?)').run(id, indexedText(String(d.title)), indexedText(String(d.sourceName)), indexedText(content));
            if (d)
                this.db.prepare('UPDATE documents SET contentChars=? WHERE id=?').run(content.length, id);
            this.db.exec('RELEASE search_update');
        }
        catch (e) {
            this.db.exec('ROLLBACK TO search_update; RELEASE search_update');
            throw e;
        }
    }
    async rebuild(): Promise<void> {
        try {
            this.db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')");
        }
        catch {
            this.db.exec("DROP TABLE document_fts; CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')");
        }
        this.db.exec('DELETE FROM document_fts WHERE documentId NOT IN(SELECT id FROM documents WHERE deletedAt IS NULL)');
        for (const {rowid} of this.db.prepare('SELECT rowid FROM document_fts').all()) {
            const row = this.db.prepare('SELECT title,filename,substr(content,1,1000000) content,length(content) chars FROM document_fts WHERE rowid=?').get(rowid!);
            if (!row) continue;
            const title = indexedText(String(row.title)), filename = indexedText(String(row.filename)), content = indexedText(String(row.content));
            if (title !== row.title || filename !== row.filename || content !== row.content || Number(row.chars) > 1_000_000)
                this.db.prepare('UPDATE document_fts SET title=?,filename=?,content=? WHERE rowid=?').run(title,filename,content,rowid!);
            await new Promise<void>(resolve=>setImmediate(resolve));
        }
        const missing = this.db.prepare("WITH indexed AS MATERIALIZED (SELECT documentId,count(*) copies,max(length(content)) chars FROM document_fts GROUP BY documentId) SELECT d.id,d.markdownPath,d.activeVersion FROM documents d LEFT JOIN indexed f ON f.documentId=d.id WHERE d.status='ready' AND d.deletedAt IS NULL AND (coalesce(f.copies,0)!=1)").all();
        for (const d of missing) {
            try {
                const path = d.activeVersion==='ai' ? join(dirname(String(d.markdownPath)),'content.ai.md') : String(d.markdownPath);
                const content = await readFile(this.root ? containedPath(this.root, path) : path, 'utf8');
                const latest=this.db.prepare('SELECT status,activeVersion FROM documents WHERE id=? AND deletedAt IS NULL').get(d.id!);
                if(latest?.status==='ready' && latest.activeVersion===d.activeVersion)this.update(String(d.id),content);
            }
            catch { /* A missing source is retried on the next startup. */ }
        }
    }
    search(text: string, limit = 50, cursor?: {
        rank: number;
        id: string;
    }) {
        const q = validateSearchQuery(text);
        
        // Trigram preserves literal substrings across zh-Hant/ja/en. Two-character fixtures
        // (資料/通信/学習/網路) need LIKE: trigram MATCH has no token below 3 codepoints.
        // Bigram unicode61 needs synthetic token/offset mapping and loses native snippets.
        const short = [...q].length < 3;
        const match = '"' + q.replaceAll('"', '""') + '"';
        const literal = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        const args = short ? [literal, literal, literal] : [match];
        const where = short ? "(f.title LIKE ? ESCAPE '\\' OR f.filename LIKE ? ESCAPE '\\' OR f.content LIKE ? ESCAPE '\\')" : 'document_fts MATCH ?';
        const rank = short ? '0' : 'bm25(document_fts,0,8,4,1)';
        const snippet = short ? 'substr(f.content,max(1,instr(lower(f.content),lower(?))-80),240)' : "snippet(document_fts,3,'[mark]','[/mark]',' … ',32)";
        const cursorWhere = cursor ? 'WHERE rank>? OR (rank=? AND documentId>?)' : '';
        const cursorArgs = cursor ? [cursor.rank, cursor.rank, cursor.id] : [];
        const rows = this.db.prepare(`WITH ranked AS MATERIALIZED (
    SELECT rowid,documentId,${rank} AS rank FROM document_fts f WHERE ${where}
  ), hits AS MATERIALIZED (SELECT * FROM ranked ${cursorWhere} ORDER BY rank,documentId LIMIT ?)
  SELECT f.documentId,f.title,${snippet} AS snippet,h.rank FROM hits h JOIN document_fts f ON f.rowid=h.rowid ${short ? "" : "WHERE document_fts MATCH ?"} ORDER BY h.rank,h.documentId`).all(...args, ...cursorArgs, limit + 1, ...(short ? [q] : [match]));
        const items = rows.slice(0, limit).map(r => ({ documentId: documentIdSchema.parse(r.documentId), title: String(r.title), snippet: short ? String(r.snippet).replaceAll(q, `[mark]${q}[/mark]`) : String(r.snippet), rank: Number(r.rank) }));
        const last = items.at(-1);
        return { items, nextCursor: rows.length > limit && last ? { rank: last.rank, id: last.documentId } : null };
    }
}
