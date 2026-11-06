import type { DatabaseSync } from 'node:sqlite';

/** A file shared by several modules keeps the most restrictive known source kind. */
export function excerptKind(db: DatabaseSync, documentId: string): string | undefined {
    const row = db.prepare(`SELECT CASE WHEN lower(json_extract(module.value,'$.kind')) IN ('assignment','assign') OR lower(json_extract(module.value,'$.modname'))='assign' THEN 'assignment' ELSE 'exam' END AS kind
        FROM moodle_files file JOIN moodle_course_details detail ON detail.courseId=file.courseId,
        json_each(detail.data,'$.sections') section, json_each(section.value,'$.modules') module,
        json_each(module.value,'$.fileIds') linked
        WHERE file.documentId=? AND linked.value=file.id
        AND (lower(json_extract(module.value,'$.kind')) IN ('assignment','assign','exam','quiz') OR lower(json_extract(module.value,'$.modname')) IN ('assign','quiz'))
        LIMIT 1`).get(documentId);
    return row ? String(row.kind) : undefined;
}
