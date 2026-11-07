/**
 * Index document text and perform literal multilingual FTS queries.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { containedPath } from "./file-paths";
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
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

type MaintenanceRows = {
    rowids: { rowid: number | bigint }[];
    missing: { id: string; markdownPath: string; activeVersion: string }[];
};

// This function is serialized into a worker; keep it independent of module bindings.
function checkSearchIndex(db: DatabaseSync): boolean {
    try {
        db.exec("INSERT INTO document_fts(document_fts) VALUES('integrity-check')");
        return true;
    } catch (error) {
        if (((error as {errcode?: number}).errcode ?? 0) % 256 !== 11) throw error;
        return false;
    }
}

function scanSearchIndex(db: DatabaseSync, valid = checkSearchIndex(db)) {
    if (!valid) db.exec("DROP TABLE document_fts; CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram')");
    const orphans = db.prepare('SELECT rowid FROM document_fts WHERE documentId NOT IN(SELECT id FROM documents WHERE deletedAt IS NULL)').all();
    for (const {rowid} of orphans) db.prepare('DELETE FROM document_fts WHERE rowid=?').run(rowid!);
    const rowids = db.prepare('SELECT rowid FROM document_fts').all();
    const missing = db.prepare("WITH indexed AS MATERIALIZED (SELECT documentId,count(*) copies,max(length(content)) chars FROM document_fts GROUP BY documentId) SELECT d.id,d.markdownPath,d.activeVersion FROM documents d LEFT JOIN indexed f ON f.documentId=d.id WHERE d.status='ready' AND d.deletedAt IS NULL AND (coalesce(f.copies,0)!=1)").all();
    return { rowids, missing };
}

function hasSearchDesync(db: DatabaseSync): boolean {
    return !!db.prepare("WITH indexed AS MATERIALIZED (SELECT documentId,count(*) copies FROM document_fts GROUP BY documentId) SELECT 1 FROM documents d LEFT JOIN indexed f ON f.documentId=d.id WHERE d.status='ready' AND d.deletedAt IS NULL AND coalesce(f.copies,0)!=1 UNION ALL SELECT 1 FROM indexed f WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.id=f.documentId AND d.deletedAt IS NULL) LIMIT 1").get();
}

function scavengeSnapshots(directory: string): void {
    mkdirSync(directory, {recursive:true,mode:0o700});
    for (const name of readdirSync(directory)) {
        const match = /^vstudy-search-check-(\d+)-/.exec(name);
        if (!match) continue;
        const path = join(directory, name);
        let dead = false;
        try { process.kill(Number(match[1]), 0); }
        catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
        if (dead || Date.now() - statSync(path).mtimeMs > 5 * 60_000)
            rmSync(path, {recursive:true,force:true});
    }
}

type CheckState = {lastSuccess?: number | undefined; pending?: boolean};
function readCheckState(path: string): CheckState {
    try {
        const value = JSON.parse(readFileSync(path, 'utf8'));
        return {lastSuccess: typeof value.lastSuccess === 'number' ? value.lastSuccess : undefined, pending: value.pending !== false};
    } catch { return {}; }
}
function writeCheckState(path: string, state: CheckState): void {
    const temporary = path + '.tmp';
    writeFileSync(temporary, JSON.stringify(state), {mode:0o600});
    renameSync(temporary, path);
}

async function scanInWorker(path: string, directory: string, check: boolean, signal?: AbortSignal): Promise<MaintenanceRows & {checked: boolean}> {
    const cleanup = () => rmSync(directory, {recursive:true,force:true});
    if (signal?.aborted) { cleanup(); throw new Error('Search maintenance cancelled'); }
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try { worker = new Worker(`
            const { parentPort, workerData } = require('node:worker_threads');
            const { DatabaseSync, backup } = require('node:sqlite');
            const { rmSync, chmodSync } = require('node:fs');
            const { join } = require('node:path');
            const checkSearchIndex = ${checkSearchIndex.toString()};
            const hasSearchDesync = ${hasSearchDesync.toString()};
            (async () => {
                let db;
                try {
                    db = new DatabaseSync(workerData.path);
                    db.exec('PRAGMA busy_timeout=5000');
                    const checked = hasSearchDesync(db) || workerData.check;
                    let valid = true;
                    if (checked) {
                        const path = join(workerData.directory, 'snapshot.sqlite');
                        db.exec('BEGIN');
                        db.prepare('SELECT count(*) FROM sqlite_master').get();
                        try { await backup(db, path); } finally { db.exec('COMMIT'); }
                        chmodSync(path, 0o600);
                        const snapshot = new DatabaseSync(path);
                        try { valid = checkSearchIndex(snapshot); } finally { snapshot.close(); }
                    }
                    const result = (${scanSearchIndex.toString()})(db, valid);
                    parentPort.postMessage({...result, checked});
                } finally {
                    try { db?.close(); } finally { rmSync(workerData.directory, {recursive:true,force:true}); }
                }
            })().catch(error => { throw error; });
        `, { eval: true, workerData: {path, directory, check} }); }
        catch (error) { cleanup(); reject(error); return; }
        const onExit = () => cleanup();
        const onSignal = (signal: NodeJS.Signals) => { cleanup(); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInterrupt); process.kill(process.pid, signal); };
        const onTerm = () => onSignal('SIGTERM');
        const onInterrupt = () => onSignal('SIGINT');
        process.once('exit', onExit);
        process.once('SIGTERM', onTerm);
        process.once('SIGINT', onInterrupt);
        const abort = () => { void worker.terminate(); };
        signal?.addEventListener('abort', abort, {once:true});
        let result: MaintenanceRows & {checked: boolean} | undefined;
        let failure: Error | undefined;
        worker.once('message', value => { result = value; });
        worker.once('error', error => { failure = error; });
        worker.once('exit', code => {
            signal?.removeEventListener('abort', abort);
            process.removeListener('exit', onExit);
            process.removeListener('SIGTERM', onTerm);
            process.removeListener('SIGINT', onInterrupt);
            cleanup();
            if (code === 0 && result && !signal?.aborted) resolve(result);
            else reject(failure ?? new Error('Search maintenance worker stopped'));
        });
    });
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
    async rebuild(options: {userData?: string; signal?: AbortSignal} = {}): Promise<void> {
        const path = String(this.db.prepare('PRAGMA database_list').get()!.file);
        const userData = options.userData ?? dirname(path);
        const marker = join(userData, 'fts-check.json');
        let state: CheckState = {};
        let checked = false;
        let rows: MaintenanceRows;
        if (path) {
            const snapshots = join(userData, 'tmp', 'fts-check');
            scavengeSnapshots(snapshots);
            state = readCheckState(marker);
            const elapsed = Date.now() - (state.lastSuccess ?? 0);
            const check = !state.lastSuccess || state.pending === true || elapsed < 0 || elapsed >= 7 * 86400000;
            writeCheckState(marker, {...state, pending:true});
            const directory = mkdtempSync(join(snapshots, `vstudy-search-check-${process.pid}-`));
            const result = await scanInWorker(path, directory, check, options.signal);
            checked = result.checked;
            rows = result;
        } else rows = scanSearchIndex(this.db) as MaintenanceRows;
        const {rowids, missing} = rows;
        for (const {rowid} of rowids) {
            options.signal?.throwIfAborted();
            const row = this.db.prepare('SELECT title,filename,substr(content,1,1000000) content,length(content) chars FROM document_fts WHERE rowid=?').get(rowid!);
            if (!row) continue;
            const title = indexedText(String(row.title)), filename = indexedText(String(row.filename)), content = indexedText(String(row.content));
            if (title !== row.title || filename !== row.filename || content !== row.content || Number(row.chars) > 1_000_000)
                this.db.prepare('UPDATE document_fts SET title=?,filename=?,content=? WHERE rowid=?').run(title,filename,content,rowid!);
            await new Promise<void>(resolve=>setImmediate(resolve));
        }
        for (const d of missing) {
            options.signal?.throwIfAborted();
            try {
                const path = d.activeVersion==='ai' ? join(dirname(String(d.markdownPath)),'content.ai.md') : String(d.markdownPath);
                const content = await readFile(this.root ? containedPath(this.root, path) : path, 'utf8');
                const latest=this.db.prepare('SELECT status,activeVersion FROM documents WHERE id=? AND deletedAt IS NULL').get(d.id!);
                if(latest?.status==='ready' && latest.activeVersion===d.activeVersion)this.update(String(d.id),content);
            }
            catch { /* A missing source is retried on the next startup. */ }
        }
        options.signal?.throwIfAborted();
        if (path) writeCheckState(marker, {lastSuccess: checked ? Date.now() : state.lastSuccess, pending:false});
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
