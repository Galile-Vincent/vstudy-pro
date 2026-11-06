import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { studyJobSummarySchema, studyJobEditSchema, studyCourseSchema, studyCourseInputSchema, studyConceptSchema, studyConceptInputSchema, studyUnitSchema, studyChatLinkSchema, studyObservationSchema, studyPageInputSchema, studyPrefsSchema, studyIdSchema, type StudyPageInput, type StudyPrefs } from '../../shared/review';
import { conceptKey } from './concept-match';
import { eligibleSourceSql } from './eligibility';
import { computeMastery, type MasteryObservation } from './mastery';
import { buildEpisodes } from './episodes';
import { MoodleRepository } from '../moodle/repository';
const jobSourceJoins = `JOIN conversations c ON c.id=j.conversationId JOIN messages u ON u.id=j.userMessageId JOIN messages a ON a.id=j.assistantMessageId LEFT JOIN study_chat_links l ON l.conversationId=c.id LEFT JOIN documents d ON d.id=c.documentId`;
const sourceJoins = `JOIN study_jobs j ON j.id=o.jobId ${jobSourceJoins}`;
/** SQL ownership for local study memory. Construction performs no work or network access. */
export class ReviewRepository {
    constructor(private readonly db: DatabaseSync, private readonly clock: () => number = Date.now) { }
    private now() { return new Date(this.clock()).toISOString(); }
    private atomic<T>(work: () => T): T { this.db.exec('SAVEPOINT study_write'); try {
        const result = work();
        this.db.exec('RELEASE study_write');
        return result;
    }
    catch (error) {
        this.db.exec('ROLLBACK TO study_write; RELEASE study_write');
        throw error;
    } }
    private requireCourse(id: string) { const course = this.getCourse(id); if (!course)
        throw new Error('Study course unavailable'); return course; }
    private page<T>(sql: string, values: SQLInputValue[], input: StudyPageInput, parse: (row: Record<string, unknown>) => T, timeColumn = 'createdAt') {
        const { limit, cursor } = studyPageInputSchema.parse({ limit: input.limit, cursor: input.cursor });
        const rows = this.db.prepare(sql + " LIMIT ?").all(...values, cursor?.at ?? null, cursor?.at ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1);
        const more = rows.length > limit;
        const selected = rows.slice(0, limit);
        const last = selected.at(-1);
        return { items: selected.map(parse), nextCursor: more && last ? { at: String(last[timeColumn]), id: String(last.id ?? last.conversationId) } : null };
    }
    getPrefs(): StudyPrefs { const row = this.db.prepare("SELECT value FROM settings WHERE key='studyPrefs'").get(); return studyPrefsSchema.parse(row ? JSON.parse(String(row.value)) : {timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}); }
    setPrefs(input: z.input<ReturnType<typeof studyPrefsSchema.partial>>): StudyPrefs { const patch = studyPrefsSchema.partial().parse(input); const result = studyPrefsSchema.parse({ ...this.getPrefs(), ...patch }); this.atomic(() => { this.db.prepare("INSERT INTO settings(key,value) VALUES('studyPrefs',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(result)); if (!result.memoryEnabled)
        this.db.prepare("UPDATE study_jobs SET status='cancelled',attemptToken=NULL,updatedAt=? WHERE status IN ('pending','running')").run(this.now()); }); return result; }
    erase(): void { this.atomic(() => { this.setPrefs({ memoryEnabled: false }); this.db.exec('DELETE FROM study_courses; DELETE FROM study_chat_links; DELETE FROM study_jobs;'); }); }
    createCourse(input: z.input<typeof studyCourseInputSchema>) { const data = studyCourseInputSchema.parse(input); const result = studyCourseSchema.parse({ ...data, id: randomUUID(), moodleCourseId: null, createdAt: this.now(), archivedAt: null }); this.db.prepare('INSERT INTO study_courses(id,title,aliases,moodleCourseId,createdAt,archivedAt) VALUES(?,?,?,?,?,?)').run(result.id, result.title, JSON.stringify(result.aliases), null, result.createdAt, null); return result; }
    getCourse(id: string) { studyIdSchema.parse(id); const row = this.db.prepare('SELECT * FROM study_courses WHERE id=?').get(id); return row ? studyCourseSchema.parse({ ...row, aliases: JSON.parse(String(row.aliases)) }) : null; }
    updateCourse(id: string, input: z.input<ReturnType<typeof studyCourseInputSchema.partial>>) { const patch = studyCourseInputSchema.partial().parse(input), course = this.requireCourse(id); this.db.prepare('UPDATE study_courses SET title=?,aliases=? WHERE id=?').run(patch.title ?? course.title, JSON.stringify(patch.aliases ?? course.aliases), id); return this.requireCourse(id); }
    archiveCourse(id: string, archived: boolean) { this.requireCourse(id); this.db.prepare('UPDATE study_courses SET archivedAt=? WHERE id=?').run(archived ? this.now() : null, id); }
    linkMoodle(id: string, moodleCourseId: string | null) { this.requireCourse(id); if (moodleCourseId)
        studyIdSchema.parse(moodleCourseId); this.db.prepare('UPDATE study_courses SET moodleCourseId=? WHERE id=?').run(moodleCourseId, id); if (moodleCourseId)
        this.seedMoodleUnits(id); return this.requireCourse(id); }
    materializeMoodleCourse(moodleCourseId: string) { studyIdSchema.parse(moodleCourseId); return this.atomic(() => { const existing = this.db.prepare('SELECT id FROM study_courses WHERE moodleCourseId=?').get(moodleCourseId); if (existing)
        return this.requireCourse(String(existing.id)); const detail = new MoodleRepository(this.db).course(moodleCourseId); const created = this.createCourse({ title: detail.course.fullName }); return this.linkMoodle(created.id, moodleCourseId); }); }
    listCourses(input: StudyPageInput & {
        includeArchived?: boolean;
    }) { return this.page('SELECT * FROM study_courses WHERE (? OR archivedAt IS NULL) AND (? IS NULL OR createdAt<? OR (createdAt=? AND id<?)) ORDER BY createdAt DESC,id DESC', [input.includeArchived ? 1 : 0], input, row => studyCourseSchema.parse({ ...row, aliases: JSON.parse(String(row.aliases)) })); }
    listUnits(input: StudyPageInput & {
        courseId: string;
    }) { const { limit, cursor } = studyPageInputSchema.parse({ limit: input.limit, cursor: input.cursor }); const rows = this.db.prepare('SELECT * FROM study_units WHERE courseId=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT ?').all(input.courseId, cursor?.id ?? null, cursor?.id ?? null, limit + 1); const selected = rows.slice(0, limit); return { items: selected.map(row => studyUnitSchema.parse(row)), nextCursor: rows.length > limit ? { at: this.now(), id: String(selected.at(-1)!.id) } : null }; }
    seedMoodleUnits(courseId: string) { const course = this.requireCourse(courseId); if (!course.moodleCourseId)
        return; const detail = new MoodleRepository(this.db).course(course.moodleCourseId); this.atomic(() => { for (const section of detail.sections.slice(0, 500)) {
        const next = detail.sections.find(s => s.number > section.number && s.weekStart);
        this.db.prepare(`INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey,sourceSectionId,startsAt,endsAt) VALUES(?,?,'moodle',?,?,?,?,?,?) ON CONFLICT(courseId,kind,sourceKey) DO UPDATE SET ordinal=excluded.ordinal,title=excluded.title,startsAt=excluded.startsAt,endsAt=excluded.endsAt`).run(randomUUID(), courseId, section.number, section.name.slice(0, 240) || 'Section', section.id, section.id, section.weekStart, next?.weekStart ?? null);
        const unit = this.db.prepare("SELECT id FROM study_units WHERE courseId=? AND kind='moodle' AND sourceKey=?").get(courseId, section.id)!;
        this.seedHeadings(courseId, String(unit.id), [section.name]);
    } }); }
    seedHeadings(courseId: string, unitId: string | null, headings: readonly string[]) { this.requireCourse(courseId); this.atomic(() => { for (const raw of headings.slice(0, 80)) {
        const label = raw.trim().slice(0, 240), key = conceptKey(label);
        if (!key)
            continue;
        this.db.prepare("INSERT INTO study_concepts(id,courseId,key,label,source,unitId,userState,note,createdAt) VALUES(?,?,?,?,'heading',?,'none',NULL,?) ON CONFLICT(courseId,key) DO NOTHING").run(randomUUID(), courseId, key, label, unitId, this.now());
    } }); }
    linkDocument(courseId: string, documentId: string, headings: readonly string[] = []) { this.requireCourse(courseId); studyIdSchema.parse(documentId); this.atomic(() => { const document = this.db.prepare('SELECT title FROM documents WHERE id=? AND deletedAt IS NULL').get(documentId); if (!document)
        throw new Error('Document unavailable'); this.db.prepare('INSERT INTO study_course_documents(courseId,documentId,attachedAt) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(courseId, documentId, this.now()); this.db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey,sourceSectionId,startsAt,endsAt) VALUES(?,?,'document',0,?,?,NULL,NULL,NULL) ON CONFLICT DO NOTHING").run(randomUUID(), courseId, String(document.title).slice(0, 240), documentId); const unit = this.db.prepare("SELECT id FROM study_units WHERE courseId=? AND kind='document' AND sourceKey=?").get(courseId, documentId)!; this.db.prepare('INSERT INTO study_document_units(courseId,documentId,unitId) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(courseId, documentId, String(unit.id)); this.seedHeadings(courseId, String(unit.id), headings); }); }
    unlinkDocument(courseId: string, documentId: string) { this.atomic(() => { const units = this.db.prepare("SELECT id FROM study_units WHERE courseId=? AND kind='document' AND sourceKey=?").all(courseId, documentId); for (const unit of units) {
        this.db.prepare('UPDATE study_observations SET unitId=NULL WHERE unitId=? AND courseId=?').run(String(unit.id), courseId);
        this.db.prepare('UPDATE study_concepts SET unitId=NULL WHERE unitId=? AND courseId=?').run(String(unit.id), courseId);
    } this.db.prepare('DELETE FROM study_course_documents WHERE courseId=? AND documentId=?').run(courseId, documentId); this.db.prepare("DELETE FROM study_units WHERE courseId=? AND kind='document' AND sourceKey=?").run(courseId, documentId); }); }
    private chatLink(id: string) { const row = this.db.prepare('SELECT * FROM study_chat_links WHERE conversationId=?').get(id); if (!row)
        throw new Error('Chat link unavailable'); return studyChatLinkSchema.parse({ ...row, confirmed: row.confirmed === 1, excludeFromMemory: row.excludeFromMemory === 1 }); }
    assignChat(conversationId: string, courseId: string | null) {
        studyIdSchema.parse(conversationId);
        if (courseId)
            this.requireCourse(courseId);
        return this.atomic(() => {
            this.db.prepare(`INSERT INTO study_chat_links(conversationId,courseId,method,confidence,confirmed,excludeFromMemory,revision,updatedAt) VALUES(?,?,'manual',1,1,0,1,?) ON CONFLICT(conversationId) DO UPDATE SET courseId=excluded.courseId,method='manual',confidence=1,confirmed=1,revision=study_chat_links.revision+1,updatedAt=excluded.updatedAt`).run(conversationId, courseId, this.now());
            this.db.prepare("UPDATE study_jobs SET status='cancelled',attemptToken=NULL,updatedAt=? WHERE conversationId=? AND status IN ('pending','running')").run(this.now(), conversationId);
            if (courseId) {
                const rows = this.db.prepare('SELECT o.* FROM study_observations o JOIN study_jobs j ON j.id=o.jobId WHERE j.conversationId=?').all(conversationId);
                this.db.prepare('DELETE FROM study_observations WHERE jobId IN (SELECT id FROM study_jobs WHERE conversationId=?)').run(conversationId);
                this.db.prepare('UPDATE study_jobs SET courseId=?,assignmentRevision=(SELECT revision FROM study_chat_links WHERE conversationId=?) WHERE conversationId=?').run(courseId, conversationId, conversationId);
                for (const row of rows) {
                    const known = row.conceptKey && this.db.prepare('SELECT 1 FROM study_concepts WHERE courseId=? AND key=?').get(courseId, String(row.conceptKey));
                    this.db.prepare('INSERT INTO study_observations(id,jobId,courseId,unitId,conceptKey,proposedLabel,errorType,signal,evidenceQuote,evidenceKind,weaknessNote,confidence,dismissed,resolved,wrongAttempt,createdAt) VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?)').run(String(row.id), String(row.jobId), courseId, known ? row.conceptKey as SQLInputValue : null, known ? null : String(row.proposedLabel ?? row.conceptKey), row.errorType as SQLInputValue, row.signal as SQLInputValue, row.evidenceQuote as SQLInputValue, row.evidenceKind as SQLInputValue, row.weaknessNote as SQLInputValue, row.confidence as SQLInputValue, row.dismissed as SQLInputValue, row.resolved as SQLInputValue, row.wrongAttempt as SQLInputValue, row.createdAt as SQLInputValue);
                }
            }
            return this.chatLink(conversationId);
        });
    }
    excludeChat(conversationId: string, excluded: boolean) { return this.atomic(() => { if (!this.db.prepare('SELECT 1 FROM study_chat_links WHERE conversationId=?').get(conversationId))
        this.assignChat(conversationId, null); this.db.prepare('UPDATE study_chat_links SET excludeFromMemory=?,revision=revision+1,updatedAt=? WHERE conversationId=?').run(excluded ? 1 : 0, this.now(), conversationId); this.db.prepare("UPDATE study_jobs SET status='cancelled',attemptToken=NULL,updatedAt=? WHERE conversationId=? AND status IN ('pending','running')").run(this.now(), conversationId); this.db.prepare('UPDATE study_jobs SET assignmentRevision=(SELECT revision FROM study_chat_links WHERE conversationId=?) WHERE conversationId=?').run(conversationId, conversationId); return this.chatLink(conversationId); }); }
    inbox(input: StudyPageInput) { return this.page(`SELECT c.id,c.id AS conversationId,NULL AS courseId,coalesce(l.method,'manual') method,coalesce(l.confidence,0) confidence,coalesce(l.confirmed,0) confirmed,coalesce(l.excludeFromMemory,0) excludeFromMemory,coalesce(l.revision,0) revision,coalesce(l.updatedAt,c.updatedAt,c.createdAt) updatedAt FROM conversations c LEFT JOIN study_chat_links l ON l.conversationId=c.id WHERE l.courseId IS NULL AND c.deletedAt IS NULL AND (? IS NULL OR coalesce(l.updatedAt,c.updatedAt,c.createdAt)<? OR (coalesce(l.updatedAt,c.updatedAt,c.createdAt)=? AND c.id<?)) ORDER BY updatedAt DESC,c.id DESC`, [], input, row => studyChatLinkSchema.parse({ conversationId: row.conversationId, courseId: row.courseId, method: row.method, confidence: row.confidence, revision: row.revision, updatedAt: row.updatedAt, confirmed: row.confirmed === 1, excludeFromMemory: row.excludeFromMemory === 1 }), 'updatedAt'); }
    listConcepts(input: StudyPageInput & {
        courseId: string;
    }) { return this.page('SELECT * FROM study_concepts WHERE courseId=? AND (? IS NULL OR createdAt<? OR (createdAt=? AND id<?)) ORDER BY createdAt DESC,id DESC', [input.courseId], input, row => studyConceptSchema.parse(row)); }
    addConcept(input: z.input<typeof studyConceptInputSchema>) { const data = studyConceptInputSchema.parse(input); this.requireCourse(data.courseId); const result = studyConceptSchema.parse({ ...data, id: randomUUID(), key: conceptKey(data.label), source: 'user', userState: 'none', createdAt: this.now() }); this.db.prepare('INSERT INTO study_concepts(id,courseId,key,label,source,unitId,userState,note,createdAt) VALUES(?,?,?,?,?,?,?,?,?)').run(result.id, result.courseId, result.key, result.label, result.source, result.unitId, result.userState, result.note, result.createdAt); return result; }
    editConcept(id: string, changes: {
        label?: string | undefined;
        note?: string | null | undefined;
    }) { studyIdSchema.parse(id); const row = this.db.prepare('SELECT * FROM study_concepts WHERE id=?').get(id); if (!row)
        throw new Error('Concept unavailable'); const result = studyConceptSchema.parse({ ...row, ...changes }); this.db.prepare('UPDATE study_concepts SET label=?,note=? WHERE id=?').run(result.label, result.note, id); return result; }
    dismissConcept(id: string) { studyIdSchema.parse(id); this.db.prepare("UPDATE study_concepts SET userState='dismissed' WHERE id=?").run(id); }
    private event(id: string, kind: 'restored' | 'understood') { this.db.prepare('INSERT INTO study_concept_events(id,conceptId,kind,at) VALUES(?,?,?,?)').run(randomUUID(), id, kind, this.now()); }
    restoreConcept(id: string) { this.atomic(() => { this.db.prepare("UPDATE study_concepts SET userState='none' WHERE id=?").run(id); this.event(id, 'restored'); }); }
    understoodConcept(id: string) { this.event(id, 'understood'); }
    jobsPage(input:StudyPageInput&{courseId:string}) {
      return this.page(`SELECT j.id,j.conversationId,j.userMessageId,j.assistantMessageId,j.courseId,j.status,j.questionSummary,j.occurredAt,j.createdAt,j.errorCode FROM study_jobs j ${jobSourceJoins} WHERE j.courseId=? AND (${eligibleSourceSql}) AND (? IS NULL OR j.occurredAt<? OR (j.occurredAt=? AND j.id<?)) ORDER BY j.occurredAt DESC,j.id DESC`,[input.courseId],input,row=>studyJobSummarySchema.parse(row),'occurredAt');
    }
    editJob(id:string,changes:z.input<typeof studyJobEditSchema>):void {
      studyIdSchema.parse(id);const patch=studyJobEditSchema.parse(changes);
      const result=this.db.prepare('UPDATE study_jobs SET questionSummary=?,updatedAt=? WHERE id=?').run(patch.questionSummary,this.now(),id);
      if(!result.changes)throw new Error('Study exchange unavailable');
    }
    observationsPage(input: StudyPageInput & {
        courseId: string;
    }) { return this.page(`SELECT o.*,j.occurredAt,j.conversationId,j.userMessageId,j.assistantMessageId,j.questionSummary FROM study_observations o ${sourceJoins} WHERE o.courseId=? AND (${eligibleSourceSql}) AND (? IS NULL OR o.createdAt<? OR (o.createdAt=? AND o.id<?)) ORDER BY o.createdAt DESC,o.id DESC`, [input.courseId], input, row => studyObservationSchema.parse({ ...row, dismissed: row.dismissed === 1, resolved: row.resolved === 1, wrongAttempt: row.wrongAttempt === 1 })); }
    editObservation(id: string, changes: {
        weaknessNote?: string | null | undefined;
        dismissed?: boolean | undefined;
        resolved?: boolean | undefined;
    }) { const row = this.db.prepare('SELECT * FROM study_observations WHERE id=?').get(id); if (!row)
        throw new Error('Observation unavailable'); const patch = z.object({ weaknessNote: z.string().max(240).nullable().optional(), dismissed: z.boolean().optional(), resolved: z.boolean().optional() }).strict().parse(changes); this.db.prepare('UPDATE study_observations SET weaknessNote=?,dismissed=?,resolved=? WHERE id=?').run(patch.weaknessNote === undefined ? row.weaknessNote as SQLInputValue : patch.weaknessNote, patch.dismissed === undefined ? row.dismissed as SQLInputValue : Number(patch.dismissed), patch.resolved === undefined ? row.resolved as SQLInputValue : Number(patch.resolved), id); }
    deleteObservation(id: string) { studyIdSchema.parse(id); this.db.prepare('DELETE FROM study_observations WHERE id=?').run(id); }
    masteryPage(input: StudyPageInput & {
        courseId: string;
    }, now: number) { const page = this.listConcepts(input); const mastery = new Map(this.computeCourseMastery(input.courseId, now).map(item => [item.id, item])); return { ...page, items: page.items.map(item => mastery.get(item.id)!) }; }
    computeCourseMastery(courseId: string, now: number) { this.requireCourse(courseId); const concepts = this.db.prepare('SELECT * FROM study_concepts WHERE courseId=?').all(courseId); const observations = this.db.prepare(`SELECT o.*,j.occurredAt,l.confirmed AS assignmentConfirmed,l.confidence AS assignmentConfidence FROM study_observations o ${sourceJoins} WHERE o.courseId=? AND (${eligibleSourceSql})`).all(courseId); return concepts.map(row => { const concept = studyConceptSchema.parse(row); const understood = this.db.prepare("SELECT max(at) at FROM study_concept_events WHERE conceptId=? AND kind='understood'").get(concept.id); const attempts = this.db.prepare("SELECT i.*,a.confirmedAt FROM study_attempt_items i JOIN study_attempts a ON a.id=i.attemptId JOIN study_artifacts r ON r.id=a.artifactId WHERE r.courseId=? AND i.conceptKey=? AND a.phase='confirmed' AND i.reportedBad=0 AND i.appliedAt IS NOT NULL").all(courseId, concept.key); return { ...concept, mastery: computeMastery(observations.filter(o => o.conceptKey === concept.key).filter((o, _i, rows) => o.assignmentConfirmed === 1 || Number(o.assignmentConfidence) >= 0.8 || buildEpisodes(rows.map(r => ({ id: String(r.id), occurredAt: String(r.occurredAt) })), this.getPrefs().timeZone).length >= 2).map(o => ({ ...o, resolved: o.resolved === 1, dismissed: o.dismissed === 1, wrongAttempt: o.wrongAttempt === 1 })) as unknown as MasteryObservation[], { now, timeZone: this.getPrefs().timeZone, userState: concept.userState, understoodAt: understood?.at ? String(understood.at) : null, attempts: attempts.filter(a => a.correct !== null).map(a => ({ at: String(a.confirmedAt), confirmed: true, correct: a.correct === 1 })) }) }; }); }
}
