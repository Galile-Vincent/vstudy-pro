/** Build a transient FTS index only from selected-account course content and ready course-linked documents. @packageDocumentation */
import { DatabaseSync } from 'node:sqlite';
import type { BackendHandlers, BackendServices } from './backend-types';
import { fail } from './backend-errors';

export function searchHandler(services:BackendServices): BackendHandlers['search_content'] {
  return async (context, args) => {
    const query = args.query.trim();
    if (query.length < 2) fail('INVALID_ARGUMENT');
    const courses = args.courseId ? [context.course(args.courseId).course] : context.courses();
    const index = new DatabaseSync(':memory:');
    try {
      index.exec("CREATE VIRTUAL TABLE search USING fts5(kind UNINDEXED,id UNINDEXED,courseId UNINDEXED,moduleId UNINDEXED,title,content,tokenize='trigram')");
      const insert = index.prepare('INSERT INTO search VALUES(?,?,?,?,?,?)');
      let bytes = 0;
      const add = (kind:string, id:string, courseId:string, moduleId:string | null, title:string, content:string) => {
        bytes += Buffer.byteLength(content);
        if (bytes > 64 * 1024 * 1024) fail('UNSUPPORTED');
        insert.run(kind, id, courseId, moduleId, context.text(title, 300), context.text(content, 1_000_000));
      };
      for (const course of courses) {
        const detail = context.course(course.id);
        add('course', course.id, course.id, null, course.fullName, course.identity.summaryHtml ?? '');
        for (const section of detail.sections.filter(row => row.accessible)) {
          add('section', section.id, course.id, null, section.name, section.summaryHtml ?? '');
          for (const module of section.modules.filter(row => row.accessible)) add('module', module.id, course.id, module.id, module.name, module.descriptionHtml ?? '');
        }
        const rows = services.options.store.db.prepare(`SELECT f.id,d.title,fts.content FROM moodle_files f
          JOIN documents d ON d.id=f.documentId JOIN document_fts fts ON fts.documentId=d.id
          WHERE f.courseId=? AND d.status='ready' AND d.deletedAt IS NULL ORDER BY f.id`).all(course.id);
        for (const row of rows) {
          try { context.file(String(row.id)); } catch { continue; }
          add('file', String(row.id), course.id, null, String(row.title), String(row.content));
        }
      }
      const short = [...query].length < 3;
      const literal = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
      const match = '"' + query.replaceAll('"', '""') + '"';
      const rows = index.prepare(short
        ? "SELECT kind,id,courseId,moduleId,title,substr(content,max(1,instr(lower(content),lower(?))-60),300) excerpt FROM search WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' ORDER BY kind,id LIMIT 10001"
        : "SELECT kind,id,courseId,moduleId,title,snippet(search,5,'','',' ',48) excerpt FROM search WHERE search MATCH ? ORDER BY bm25(search,0,0,0,0,8,1),kind,id LIMIT 10001")
        .all(...(short ? [query, literal, literal] : [match]));
      if (rows.length > 10_000) fail('UNSUPPORTED');
      return services.pages.page(rows.map(row => ({kind:String(row.kind), id:String(row.id), courseId:String(row.courseId), moduleId:row.moduleId ? String(row.moduleId) : null, title:String(row.title), excerpt:context.text(String(row.excerpt), 600)})), services.pages.binding('search_content', context.accountId, args), args);
    } finally { index.close(); }
  };
}
