/**
 * Search conversation titles and active messages with literal text and bounded pagination.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
/** Local history repository. Rank before snippets and use keysets with a stable UUID tie breaker. */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { chatSearchSchema, chatHitSchema, type ChatSearch, type ChatPatch } from '../../shared/chat-history';
const attachment = `EXISTS(SELECT 1 FROM messages m,json_each(m.parts) p WHERE m.conversationId=c.id AND m.supersededBy IS NULL AND json_type(p.value,'$.selection')='object')`;
const citation = `EXISTS(SELECT 1 FROM messages m,json_each(m.parts) p WHERE m.conversationId=c.id AND m.supersededBy IS NULL AND json_array_length(p.value,'$.citations')>0)`;
const course = `coalesce(c.courseId,(SELECT courseId FROM moodle_files WHERE documentId=c.documentId ORDER BY id LIMIT 1))`;
const term = `json_extract(mc.data,'$.identity.term')`;
const phrase = (q: string) => `"${q.replaceAll('"', '""')}"`;
const like = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
/** Return a bounded text snippet with inert match markers rather than trusted HTML. */
export function markedSnippet(text: string, query: string): string {
  if (!query)
    return text.slice(0, 240);
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0)
    return text.slice(0, 240);
  const start = Math.max(0, at - 70), end = Math.min(text.length, at + query.length + 100);
  return `${start ? '…' : ''}${text.slice(start, at)}[mark]${text.slice(at, at + query.length)}[/mark]${text.slice(at + query.length, end)}${end < text.length ? '…' : ''}`;
}
/** Create conversation search and metadata operations on the caller-owned SQLite connection. */
export function chatHistoryRepository(db: DatabaseSync) {
  return {
    facets() {
      return {
        courses: db.prepare("SELECT id,coalesce(json_extract(data,'$.fullName'),'') AS title,json_extract(data,'$.identity.term') AS term FROM moodle_courses ORDER BY title").all().map(r => ({ id: String(r.id), title: String(r.title), term: r.term === null ? null : String(r.term) })),
        documents: db.prepare('SELECT id,title FROM documents WHERE deletedAt IS NULL ORDER BY title').all().map(r => ({ id: String(r.id) as import('../../shared/domain').Document['id'], title: String(r.title) })),
        models: db.prepare('SELECT DISTINCT modelId FROM conversations WHERE deletedAt IS NULL ORDER BY modelId').all().map(r => String(r.modelId)),
      };
    },
    search(input: ChatSearch) {
      const q = chatSearchSchema.parse(input), values: SQLInputValue[] = [];
      const filters = ['c.deletedAt IS NULL', '(c.documentId IS NULL OR d.deletedAt IS NULL)'];
      const add = (sql: string, ...args: SQLInputValue[]) => { filters.push(sql); values.push(...args); };
      if (q.scope !== 'all')
        add('c.scope=?', { courses: 'course', documents: 'document', general: 'general' }[q.scope]);
      if (q.courseIds?.length)
        add(`${course} IN (${q.courseIds.map(() => '?').join(',')})`, ...q.courseIds);
      if (q.term !== undefined)
        add(`${term}=?`, q.term);
      if (q.documentId)
        add('c.documentId=?', q.documentId);
      if (q.from)
        add('c.createdAt>=?', q.from);
      if (q.to)
        add('c.createdAt<=?', q.to);
      if (q.pinned !== undefined)
        add('c.pinned=?', Number(q.pinned));
      add('c.archived=?', Number(q.archived ?? false));
      if (q.model)
        add('c.modelId=?', q.model);
      if (q.provider)
        add('c.providerId=?', q.provider);
      if (q.hasAttachments !== undefined)
        add(`${attachment}=?`, Number(q.hasAttachments));
      if (q.hasCitations !== undefined)
        add(`${citation}=?`, Number(q.hasCitations));
      const long = [...q.query].length >= 3;
      const matching = q.query ? long ? 'chat_fts MATCH ?' : `(title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')` : '1';
      const searchValues: SQLInputValue[] = q.query ? long ? [phrase(q.query)] : [like(q.query), like(q.query)] : [];
      const roleSql = q.role ? ' AND role=?' : '';
      if (q.role)
        searchValues.push(q.role);
      const cursorSql = q.cursor ? 'WHERE rank>? OR (rank=? AND (updatedAt<? OR (updatedAt=? AND id<?)))' : '';
      const cursorValues = q.cursor ? [q.cursor.rank, q.cursor.rank, q.cursor.updatedAt, q.cursor.updatedAt, q.cursor.id] : [];
      const rows = db.prepare(`WITH hits AS MATERIALIZED (
    SELECT conversationId,${q.query && long ? 'bm25(chat_fts,0,0,0,8,1)' : '0'} AS score FROM chat_fts WHERE ${matching}${roleSql}
   ), ranked AS (
    SELECT c.id,c.scope,c.documentId,${course} AS courseId,c.providerId,c.modelId,c.createdAt,
    coalesce(c.updatedAt,c.createdAt) AS updatedAt,c.pinned,c.archived,
    coalesce(c.title,(SELECT substr(json_extract(parts,'$[0].text'),1,120) FROM messages WHERE conversationId=c.id AND role='user' AND supersededBy IS NULL ORDER BY createdAt,id LIMIT 1),'') AS title,
    d.title AS documentTitle,json_extract(mc.data,'$.fullName') AS courseTitle,
    json_extract(mc.data,'$.color') AS courseColor,${term} AS term,
    ${attachment} AS hasAttachments,${citation} AS hasCitations,min(hits.score) AS rank
    FROM hits JOIN conversations c ON c.id=hits.conversationId
    LEFT JOIN documents d ON d.id=c.documentId LEFT JOIN moodle_courses mc ON mc.id=${course}
    WHERE ${filters.join(' AND ')} GROUP BY c.id
   ) SELECT * FROM ranked ${cursorSql} ORDER BY rank,updatedAt DESC,id DESC LIMIT ?`).all(...searchValues, ...values, ...cursorValues, q.limit + 1);
      const items = rows.slice(0, q.limit).map(row => {
        const snippets = db.prepare(`SELECT messageId,role,${q.query && long ? "snippet(chat_fts,4,'[mark]','[/mark]','…',40)" : 'text'} AS snippet
     FROM chat_fts WHERE conversationId=? AND messageId IS NOT NULL AND ${matching}${roleSql}
     ORDER BY ${q.query && long ? 'bm25(chat_fts,0,0,0,8,1),' : ''} rowid DESC LIMIT 3`).all(String(row.id), ...searchValues);
        return chatHitSchema.parse({ ...row, pinned: !!row.pinned, archived: !!row.archived, hasAttachments: !!row.hasAttachments, hasCitations: !!row.hasCitations,
          titleSnippet: markedSnippet(String(row.title), q.query), matches: snippets.map(m => ({ ...m, snippet: long && q.query ? m.snippet : markedSnippet(String(m.snippet), q.query) })) });
      });
      const last = items.at(-1);
      return { items, nextCursor: rows.length > q.limit && last ? { rank: last.rank, updatedAt: last.updatedAt, id: last.id } : null };
    },
    update(id: string, patch: ChatPatch) {
      const row = db.prepare('SELECT deletedAt FROM conversations WHERE id=?').get(id);
      if (!row)
        throw new Error('Conversation unavailable');
      if (patch.deleted === false && typeof row.deletedAt === 'string' && Date.parse(row.deletedAt) < Date.now() - 30_000)
        throw new Error('Undo expired');
      const sets: string[] = [], values: SQLInputValue[] = [];
      for (const key of ['title', 'pinned', 'archived'] as const)
        if (patch[key] !== undefined) {
          sets.push(`${key}=?`);
          values.push(key === 'title' ? patch[key] || null : Number(patch[key]));
        }
      if (patch.deleted !== undefined) {
        sets.push('deletedAt=?');
        values.push(patch.deleted ? new Date().toISOString() : null);
      }
      if (sets.length)
        db.prepare(`UPDATE conversations SET ${sets.join(',')} WHERE id=?`).run(...values, id);
    },
  };
}
