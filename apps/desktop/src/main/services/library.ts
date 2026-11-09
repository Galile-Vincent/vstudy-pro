/**
 * Query and organize library metadata, folders, tags, pins, and soft deletion.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { rm } from 'node:fs/promises';
import { activeConversions, activePurges } from "./conversion-state";
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SQLInputValue } from 'node:sqlite';
import type { Store } from '../db';
import { documentIdSchema, documentSchema } from '../../shared/domain';
import { folderSchema, libraryCourseSchema, libraryDocumentSchema, libraryQuerySchema, savedFilterSchema, tagSchema, type LibraryQuery } from '../../shared/library';
import { SearchService, validateSearchQuery } from './search';
import { containedPath } from "./file-paths";
export { containedPath } from "./file-paths";
function courseOf(row: Record<string, unknown>) {
    if (typeof row.courseId !== 'string' || typeof row.courseData !== 'string') return null;
    try {
        const data = JSON.parse(row.courseData) as { fullName?: unknown; identity?: Record<string, unknown> };
        const parsed = libraryCourseSchema.safeParse({ id: row.courseId, fullName: data.fullName, identity: { title: data.identity?.title, teachers: data.identity?.teachers, term: data.identity?.term } });
        return parsed.success ? parsed.data : null;
    }
    catch { return null; }
}
/** Organize and page library metadata without reading full document bodies. */
export class LibraryService {
    readonly search: SearchService;
    constructor(readonly store: Store, readonly root: string) { this.search = new SearchService(store.db, root); }
    transaction<T>(fn: () => T): T { const db = this.store.db; db.exec('SAVEPOINT library'); try {
        const result = fn();
        db.exec('RELEASE library');
        return result;
    }
    catch (e) {
        db.exec('ROLLBACK TO library; RELEASE library');
        throw e;
    } }
    folders() { return this.store.db.prepare('SELECT f.*,(WITH RECURSIVE subtree(id) AS (SELECT f.id UNION ALL SELECT child.id FROM folders child JOIN subtree s ON child.parentId=s.id) SELECT count(*) FROM documents d WHERE d.folderId IN (SELECT id FROM subtree) AND d.deletedAt IS NULL) AS count FROM folders f ORDER BY position,id').all().map(r => folderSchema.parse(r)); }
    private folder(id: string) { const f = this.store.db.prepare('SELECT * FROM folders WHERE id=?').get(id); if (!f)
        throw new Error('Folder not found'); return folderSchema.parse(f); }
    private ancestors(id: string | null) { const result: string[] = []; while (id) {
        if (result.includes(id))
            throw new Error('Folder cycle');
        result.push(id);
        id = this.folder(id).parentId;
    } return result; }
    createFolder(name: string, parentId: string | null) { return this.transaction(() => { if (this.ancestors(parentId).length >= 8)
        throw new Error('Folder depth exceeds 8'); const id = randomUUID(), now = new Date().toISOString(); this.store.db.prepare('INSERT INTO folders(id,parentId,name,position,createdAt,updatedAt) VALUES(?,?,?,(SELECT coalesce(max(position),0)+1024 FROM folders WHERE parentId IS ?),?,?)').run(id, parentId, name, parentId, now, now); return this.folder(id); }); }
    updateFolder(id: string, patch: {
        name?: string | undefined;
        color?: string | null | undefined;
        icon?: string | null | undefined;
        pinned?: boolean | undefined;
    }) { return this.transaction(() => { this.folder(id); for (const key of ['name', 'color', 'icon', 'pinned'] as const) {
        if (patch[key] !== undefined)
            this.store.db.prepare(`UPDATE folders SET ${key}=?,updatedAt=? WHERE id=?`).run(typeof patch[key] === 'boolean' ? Number(patch[key]) : patch[key]!, new Date().toISOString(), id);
    } if (patch.pinned !== undefined)
        this.store.db.prepare('UPDATE folders SET pinnedAt=CASE WHEN ? THEN coalesce(pinnedAt,?) ELSE NULL END WHERE id=?').run(Number(patch.pinned), new Date().toISOString(), id); return this.folder(id); }); }
    private position(table: 'documents' | 'folders', parent: string | null, before?: string): number {
        const column = table === 'documents' ? 'folderId' : 'parentId';
        const rows = this.store.db.prepare(`SELECT id,position FROM ${table} WHERE ${column} IS ? ${table === 'documents' ? 'AND deletedAt IS NULL' : ''} ORDER BY position,id`).all(parent);
        const i = before ? rows.findIndex(r => r.id === before) : rows.length;
        if (i < 0)
            throw new Error('Invalid reorder target');
        let left = i ? Number(rows[i - 1]!.position) : 0, right = i < rows.length ? Number(rows[i]!.position) : left + 2048;
        if (right - left < 1e-6) {
            rows.forEach((r, n) => this.store.db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run((n + 1) * 1024, String(r.id)));
            left = i * 1024;
            right = (i + 1) * 1024;
        }
        return (left + right) / 2;
    }
    moveFolder(id: string, parentId: string | null, before?: string) { this.transaction(() => { this.folder(id); const ancestors = this.ancestors(parentId); if (ancestors.includes(id))
        throw new Error('Folder cycle'); const height = (folder: string): number => 1 + Math.max(0, ...this.folders().filter(f => f.parentId === folder).map(f => height(f.id))); if (ancestors.length + height(id) > 8)
        throw new Error('Folder depth exceeds 8'); if (before === id)
        return; this.store.db.prepare('UPDATE folders SET parentId=?,position=?,updatedAt=? WHERE id=?').run(parentId, this.position('folders', parentId, before), new Date().toISOString(), id); }); }
    deleteFolder(id: string, destination: 'parent' | 'unfiled') { this.transaction(() => { const f = this.store.db.prepare('SELECT parentId FROM folders WHERE id=?').get(id); if (!f)
        return; const target = destination === 'parent' ? f.parentId : null; this.store.db.prepare('UPDATE documents SET folderId=? WHERE folderId=?').run(target!, id); this.store.db.prepare('UPDATE folders SET parentId=? WHERE parentId=?').run(target!, id); this.store.db.prepare('DELETE FROM folders WHERE id=?').run(id); }); }
    move(ids: string[], folderId: string | null, before?: string) { this.transaction(() => { if (folderId)
        this.folder(folderId); if (before && ids.includes(before))
        throw new Error('Invalid reorder target'); for (const id of [...new Set(ids)]) {
        this.require(id);
        this.store.db.prepare('UPDATE documents SET folderId=?,position=? WHERE id=?').run(folderId, this.position('documents', folderId, before), id);
    } }); }
    require(id: string) { const d = this.store.documents.get(documentIdSchema.parse(id)); if (!d)
        throw new Error('Document not found'); return d; }
    item(row: Record<string, unknown>) { return libraryDocumentSchema.parse({ document: documentSchema.parse(Object.fromEntries(['id','title','sourceName','sourceHash','sourcePath','mime','converter','status','activeVersion','markdownPath','createdAt',...(row.status==='failed'?['error']:[])].map(key=>[key,row[key]]))), folderId: row.folderId as string | null, position: Number(row.position), pinned: Boolean(row.pinned), pinnedAt: row.pinnedAt as string | null, lastOpenedAt: row.lastOpenedAt as string | null, pageCount: row.pageCount as number | null, sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes), contentChars: row.contentChars === null ? null : Number(row.contentChars), course: courseOf(row) }); }
    list(input: LibraryQuery) {
        const q = libraryQuerySchema.parse(input), args: SQLInputValue[] = [], where = ['d.deletedAt IS NULL'];
        const add = (sql: string, ...values: SQLInputValue[]) => { where.push(sql); args.push(...values); };
        if (q.folderId !== undefined) {
            if (q.subfolders && q.folderId)
                add('d.folderId IN(WITH RECURSIVE subtree(id) AS(SELECT ? UNION ALL SELECT f.id FROM folders f JOIN subtree s ON f.parentId=s.id) SELECT id FROM subtree)', q.folderId);
            else
                add('d.folderId IS ?', q.folderId);
        }
        if (q.view === 'unfiled')
            add('d.folderId IS NULL');
        if (q.view === 'recent')
            add('d.lastOpenedAt IS NOT NULL');
        if (q.view === 'pinned')
            add('d.pinned=1');
        if (q.view === 'converting-failed')
            add("d.status IN('converting','failed')");
        if (q.status)
            add('d.status=?', q.status);
        if (q.converter)
            add('d.converter=?', q.converter);
        if (q.pinned !== undefined)
            add('d.pinned=?', Number(q.pinned));
        if (q.tagId)
            add('EXISTS(SELECT 1 FROM document_tags t WHERE t.documentId=d.id AND t.tagId=?)', q.tagId);
        if (q.hasChats !== undefined)
            add(`${q.hasChats ? '' : 'NOT '}EXISTS(SELECT 1 FROM conversations c JOIN messages m ON m.conversationId=c.id WHERE c.documentId=d.id)`);
        if (q.addedAfter)
            add('d.createdAt>=?', q.addedAfter);
        if (q.addedBefore)
            add('d.createdAt<=?', q.addedBefore);
        if (q.minSize !== undefined)
            add('d.sizeBytes>=?', q.minSize);
        if (q.maxSize !== undefined)
            add('d.sizeBytes<=?', q.maxSize);
        const groups: Record<string, string[]> = { pdf: ['application/pdf'], word: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], excel: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'], powerpoint: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], text: ['text/markdown', 'text/plain'], web: ['text/html'] };
        if (q.type) {
            const types = q.type === 'other' ? Object.values(groups).flat() : groups[q.type]!;
            add(`d.mime ${q.type === 'other' ? 'NOT ' : ''}IN(${types.map(() => '?').join(',')})`, ...types);
        }
        if (q.text) {
            const text = validateSearchQuery(q.text);
            if ([...text].length < 3) {
                const literal = '%' + text.replace(/[\\%_]/g, '\\$&') + '%';
                add("d.id IN(SELECT documentId FROM document_fts WHERE title LIKE ? ESCAPE '\\' OR filename LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')", literal, literal, literal);
            }
            else
                add('d.id IN(SELECT documentId FROM document_fts WHERE document_fts MATCH ?)', '"' + text.replaceAll('"', '""') + '"');
        }
        const columns = { manual: 'd.position', name: 'd.title COLLATE NOCASE', createdAt: 'd.createdAt', lastOpenedAt: "coalesce(d.lastOpenedAt,'')", size: 'coalesce(d.sizeBytes,-1)', type: 'd.mime' };
        const pinOrder = q.view === 'pinned' && q.sort === 'manual';
        const recentOrder = q.view === 'recent' && q.sort === 'manual';
        const direction = pinOrder || recentOrder ? 'desc' : q.direction;
        const column = pinOrder ? "coalesce(d.pinnedAt,'')" : recentOrder ? "coalesce(d.lastOpenedAt,'')" : columns[q.sort], op = direction === 'asc' ? '>' : '<';
        if (q.cursor)
            add(`(${column} ${op} ? OR (${column}=? AND d.id ${op} ?))`, q.cursor.value, q.cursor.value, q.cursor.id);
        const rows = this.store.db.prepare(`SELECT d.*,mc.id AS courseId,mc.data AS courseData FROM documents d LEFT JOIN moodle_courses mc ON mc.id=(SELECT courseId FROM moodle_files WHERE documentId=d.id ORDER BY id LIMIT 1) WHERE ${where.join(' AND ')} ORDER BY ${column} ${direction},d.id ${direction} LIMIT ?`).all(...args, q.limit + 1);
        const items = rows.slice(0, q.limit).map(r => this.item(r));
        if (items.length) {
            const assignments=this.store.db.prepare(`SELECT dt.documentId,t.* FROM document_tags dt JOIN tags t ON t.id=dt.tagId WHERE dt.documentId IN(${items.map(()=>'?').join(',')})`).all(...items.map(i=>i.document.id));
            for(const item of items) item.tags=assignments.filter(t=>t.documentId===item.document.id).map(t=>tagSchema.parse(t));
        }
        if(q.text&&items.length){
            const text=q.text,short=[...text].length<3,match='"'+text.replaceAll('"','""')+'"';
            const snippet=short?"substr(content,max(1,instr(lower(content),lower(?))-80),240)":"snippet(document_fts,3,'[mark]','[/mark]',' … ',32)";
            const snippets=this.store.db.prepare(`SELECT documentId,${snippet} AS snippet FROM document_fts WHERE documentId IN(${items.map(()=>'?').join(',')}) ${short?'':'AND document_fts MATCH ?'}`).all(...(short?[text]:[]),...items.map(i=>i.document.id),...(short?[]:[match]));
            for(const item of items){const value=String(snippets.find(s=>s.documentId===item.document.id)?.snippet??'');item.snippet=short?value.replaceAll(text,`[mark]${text}[/mark]`):value;}
        }
        const last = rows[Math.min(q.limit, rows.length) - 1];
        const key = pinOrder ? 'pinnedAt' : recentOrder ? 'lastOpenedAt' : { manual: 'position', name: 'title', createdAt: 'createdAt', lastOpenedAt: 'lastOpenedAt', size: 'sizeBytes', type: 'mime' }[q.sort];
        return { items, nextCursor: rows.length > q.limit && last ? { value: (last[key] ?? (key === 'sizeBytes' ? -1 : '')) as string | number, id: documentIdSchema.parse(last.id) } : null };
    }
    pin(id: string, pinned: boolean) { this.require(id); this.store.db.prepare('UPDATE documents SET pinned=?,pinnedAt=CASE WHEN ? THEN coalesce(pinnedAt,?) ELSE NULL END WHERE id=?').run(Number(pinned), Number(pinned), new Date().toISOString(), id); }
    reorderPins(table: 'documents' | 'folders', ids: string[]) { this.transaction(() => ids.forEach((id, i) => this.store.db.prepare(`UPDATE ${table} SET pinnedAt=? WHERE id=? AND pinned=1`).run(new Date(Date.now() - i).toISOString(), id))); }
    rename(id: string, title: string) { this.require(id); this.store.db.prepare('UPDATE documents SET title=? WHERE id=?').run(title, id); }
    softDelete(id: string) {
        const result = this.store.db.prepare('UPDATE documents SET deletedAt=coalesce(deletedAt,?) WHERE id=?').run(new Date().toISOString(), id);
        if (!result.changes) throw new Error('Document not found');
    }
    restore(id: string, reason: 'undo' | 'import' = 'undo') { if(activePurges.has(id))throw new Error('storage.busy'); this.transaction(() => { const r = this.store.db.prepare('SELECT deletedAt,markdownPath,activeVersion FROM documents WHERE id=?').get(id); if (!r)
        throw new Error('Document not found'); if (r.deletedAt === null)
        return; if (reason === 'undo' && Date.now() - Date.parse(String(r.deletedAt)) > 30000)
        throw new Error('Undo expired'); this.store.db.prepare('UPDATE documents SET deletedAt=NULL WHERE id=?').run(id); if (r.markdownPath) {
        try {
            this.search.update(id, readFileSync(containedPath(this.root, r.activeVersion==='ai'?join(dirname(String(r.markdownPath)),'content.ai.md'):String(r.markdownPath)), 'utf8'));
        }
        catch { /* Rebuild retries unavailable content at startup. */ }
    } }); }
    purge() { for (const d of this.store.db.prepare('SELECT id,sourceHash FROM documents WHERE deletedAt<=?').all(new Date(Date.now() - 30000).toISOString())) {
        if (activeConversions.has(String(d.id))) continue;
        const path = join(this.root, String(d.sourceHash));
        try {
            containedPath(this.root, path);
            rmSync(path, { recursive: true, force: true });
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
        this.store.db.prepare('DELETE FROM documents WHERE id=? AND deletedAt IS NOT NULL').run(String(d.id));
    } }
    async purgeAsync(): Promise<void> {
        for (const d of this.store.db.prepare('SELECT id,sourceHash FROM documents WHERE deletedAt<=?').all(new Date(Date.now()-30000).toISOString())) {
            const id=String(d.id);
            if(activeConversions.has(id) || activePurges.has(id))continue;
            activePurges.add(id);
            try {
                const path=join(this.root,String(d.sourceHash));
                try {containedPath(this.root,path);await rm(path,{recursive:true,force:true,maxRetries:3});}
                catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
                this.store.db.prepare('DELETE FROM documents WHERE id=? AND deletedAt IS NOT NULL').run(id);
            } finally {activePurges.delete(id);}
        }
    }
    tags() { return this.store.db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all().map(r => tagSchema.parse(r)); }
    saveTag(input: {
        id?: string | undefined;
        name: string;
        color: string | null;
    }) { const id = input.id ?? randomUUID(); this.store.db.prepare('INSERT INTO tags VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color').run(id, input.name, input.color); return tagSchema.parse({ id, name: input.name, color: input.color }); }
    deleteTag(id: string) { this.store.db.prepare('DELETE FROM tags WHERE id=?').run(id); }
    tag(id: string, tagId: string, assigned: boolean) { this.require(id); this.store.db.prepare(assigned ? 'INSERT OR IGNORE INTO document_tags VALUES(?,?)' : 'DELETE FROM document_tags WHERE documentId=? AND tagId=?').run(id, tagId); }
    filters() { return this.store.db.prepare('SELECT * FROM saved_filters ORDER BY position,id').all().map(r => savedFilterSchema.parse(r)); }
    saveFilter(input: {
        id?: string | undefined;
        name: string;
        query: LibraryQuery;
        position: number;
    }) { const f = { id: input.id ?? randomUUID(), name: input.name, queryJson: JSON.stringify(libraryQuerySchema.parse(input.query)), position: input.position }; this.store.db.prepare('INSERT INTO saved_filters VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,queryJson=excluded.queryJson,position=excluded.position').run(f.id, f.name, f.queryJson, f.position); return savedFilterSchema.parse(f); }
    deleteFilter(id: string) { this.store.db.prepare('DELETE FROM saved_filters WHERE id=?').run(id); }
}
