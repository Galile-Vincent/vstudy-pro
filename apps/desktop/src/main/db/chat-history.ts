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
      if (!q.query && q.role)
        add('EXISTS(SELECT 1 FROM messages WHERE conversationId=c.id AND supersededBy IS NULL AND role=?)', q.role);
      const cursorSql = q.cursor ? q.query
        ? 'WHERE rank>? OR (rank=? AND (updatedAt<? OR (updatedAt=? AND id<?)))'
        : 'WHERE (updatedAt,id)<(?,?)' : '';
      const cursorValues = q.cursor ? q.query
        ? [q.cursor.rank, q.cursor.rank, q.cursor.updatedAt, q.cursor.updatedAt, q.cursor.id]
        : [q.cursor.updatedAt, q.cursor.id] : [];
      // OFFSET prevents flattening while allowing BM25 evaluation in a streaming coroutine.
      const hits = q.query ? `hits AS (
        SELECT conversationRowid,${long ? 'bm25(chat_fts,0,0,0,8,1)' : '0'} AS score FROM chat_fts WHERE ${matching}${roleSql} LIMIT -1 OFFSET 0
      ), scores AS (SELECT conversationRowid,min(score) AS rank FROM hits GROUP BY conversationRowid),` : '';
      const rows = db.prepare(`WITH ${hits} candidates AS (
        SELECT c.*,${q.query ? 'scores.rank' : '0 AS rank'} FROM conversations c
        ${q.query ? 'JOIN scores ON scores.conversationRowid=c.rowid' : 'INDEXED BY conversations_history_recent'}
        LEFT JOIN documents d ON d.id=c.documentId ${q.term !== undefined ? `LEFT JOIN moodle_courses mc ON mc.id=${course}` : ''}
        WHERE ${filters.join(' AND ')}
      ), page AS MATERIALIZED (
        SELECT * FROM candidates ${cursorSql} ORDER BY ${q.query ? 'rank,' : ''}updatedAt DESC,id DESC LIMIT ?
      ) SELECT c.id,c.scope,c.documentId,${course} AS courseId,c.providerId,c.modelId,c.createdAt,
        c.updatedAt,c.pinned,c.archived,c.rank,
        coalesce(c.title,(SELECT substr(json_extract(parts,'$[0].text'),1,120) FROM messages WHERE conversationId=c.id AND role='user' AND supersededBy IS NULL ORDER BY createdAt,id LIMIT 1),'') AS title,
        d.title AS documentTitle,json_extract(mc.data,'$.fullName') AS courseTitle,
        json_extract(mc.data,'$.color') AS courseColor,${term} AS term,
        ${attachment} AS hasAttachments,${citation} AS hasCitations
        FROM page c LEFT JOIN documents d ON d.id=c.documentId LEFT JOIN moodle_courses mc ON mc.id=${course}
        ORDER BY ${q.query ? 'rank,' : ''}c.updatedAt DESC,c.id DESC`).all(...(q.query ? searchValues : []), ...values, ...cursorValues, q.limit + 1);
      const selected = rows.slice(0, q.limit);
      const snippets = selected.length && q.query ? db.prepare(`SELECT c.id AS conversationId,messageId,role,text AS snippet
        FROM chat_fts JOIN conversations c ON c.rowid=chat_fts.conversationRowid WHERE chat_fts.rowid IN (SELECT rowid FROM messages WHERE conversationId IN (${selected.map(() => '?').join(',')}) AND supersededBy IS NULL)
        ${roleSql}
        ORDER BY chat_fts.rowid DESC`).all(...selected.map(row => String(row.id)), ...(q.role ? [q.role] : [])) : [];
      const matches = new Map<string, typeof snippets>();
      for (const snippet of snippets) {
        if (!String(snippet.snippet).toLowerCase().includes(q.query.toLowerCase())) continue;
        const id = String(snippet.conversationId), group = matches.get(id) ?? [];
        if (group.length < 3) group.push(snippet);
        matches.set(id, group);
      }
      const items = selected.map(row => chatHitSchema.parse({ ...row,
        pinned: !!row.pinned, archived: !!row.archived, hasAttachments: !!row.hasAttachments, hasCitations: !!row.hasCitations,
        titleSnippet: markedSnippet(String(row.title), q.query), matches: (matches.get(String(row.id)) ?? []).map(m => ({ messageId: m.messageId, role: m.role, snippet: markedSnippet(String(m.snippet), q.query) })) }));
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
