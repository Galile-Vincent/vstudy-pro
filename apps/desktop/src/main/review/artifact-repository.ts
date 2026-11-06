import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { artifactSchema, generationRequestSchema, type GenerationRequest } from '../../shared/review-generate';
import { studyPageInputSchema, type StudyPageInput } from '../../shared/review';
import type { StudyResolvedScope, StudyTest } from '../../shared/review-artifacts';
import { PROMPT_VERSION } from './prompts';
import { eligibleSourceSql } from './eligibility';
import { dateRange, type ScopeInputs } from './scope';
export class ArtifactRepository {
    constructor(readonly db: DatabaseSync, readonly clock = Date.now) { }
    atomic<T>(fn: () => T): T { this.db.exec('SAVEPOINT review_artifact'); try {
        const r = fn();
        this.db.exec('RELEASE review_artifact');
        return r;
    }
    catch (e) {
        this.db.exec('ROLLBACK TO review_artifact; RELEASE review_artifact');
        throw e;
    } }
    private parse(row: Record<string, unknown>) { return artifactSchema.parse({ id: row.id, courseId: row.courseId, kind: row.kind, title: row.title, scope: JSON.parse(String(row.scopeJson)), resolvedScope: JSON.parse(String(row.resolvedScopeJson)), status: row.status, bodyMarkdown: row.bodyMarkdown, test: row.testJson ? JSON.parse(String(row.testJson)) : null, providerId: row.providerId, modelId: row.modelId, errorCode: row.errorCode, createdAt: row.createdAt }); }
    find(id: string) { const row = this.db.prepare('SELECT * FROM study_artifacts WHERE id=?').get(id); return row ? this.parse(row) : null; }
    byKey(key: string) { const row = this.db.prepare('SELECT id FROM study_artifacts WHERE idempotencyKey=?').get(key); return row ? this.find(String(row.id)) : null; }
    create(request: GenerationRequest, snapshot: StudyResolvedScope, token: string) { const r = generationRequestSchema.parse(request), id = randomUUID(); this.db.prepare("INSERT INTO study_artifacts(id,courseId,kind,title,scopeJson,resolvedScopeJson,status,idempotencyKey,attemptToken,providerId,modelId,promptVersion,createdAt) VALUES(?,?,?,?,?,?,'generating',?,?,?,?,?,?)").run(id, r.courseId, r.kind, r.title, JSON.stringify(r.scope), JSON.stringify(snapshot), r.idempotencyKey, token, r.providerId, r.modelId, PROMPT_VERSION, new Date(this.clock()).toISOString()); return this.find(id)!; }
    retry(id: string, token: string) { return this.db.prepare("UPDATE study_artifacts SET status='generating',attemptToken=?,errorCode=NULL,bodyMarkdown=NULL,testJson=NULL WHERE id=? AND status IN ('failed','interrupted')").run(token, id).changes > 0; }
    snapshot(id: string, token: string, snapshot: StudyResolvedScope) { this.db.prepare("UPDATE study_artifacts SET resolvedScopeJson=? WHERE id=? AND attemptToken=? AND status='generating'").run(JSON.stringify(snapshot), id, token); }
    finish(id: string, token: string, result: {
        bodyMarkdown: string;
    } | {
        test: StudyTest;
    }) { this.db.prepare("UPDATE study_artifacts SET status='ready',bodyMarkdown=?,testJson=?,errorCode=NULL WHERE id=? AND attemptToken=? AND status='generating'").run('bodyMarkdown' in result ? result.bodyMarkdown : null, 'test' in result ? JSON.stringify(result.test) : null, id, token); }
    fail(id: string, token: string, code: string) { this.db.prepare("UPDATE study_artifacts SET status='failed',errorCode=? WHERE id=? AND attemptToken=? AND status='generating'").run(code, id, token); }
    cancel(id: string) { this.db.prepare("UPDATE study_artifacts SET status='interrupted',attemptToken=?,errorCode='review.cancelled' WHERE id=? AND status='generating'").run(randomUUID(), id); }
    recover() { this.db.prepare("UPDATE study_artifacts SET status='interrupted',attemptToken=?,errorCode='review.interrupted' WHERE status='generating'").run(randomUUID()); }
    delete(id: string) { this.db.prepare('DELETE FROM study_artifacts WHERE id=?').run(id); }
    list(input: StudyPageInput & {
        courseId: string;
    }) {
        const { limit, cursor } = studyPageInputSchema.parse({ limit: input.limit, cursor: input.cursor });
        const rows = this.db.prepare('SELECT id,courseId,kind,title,scopeJson,resolvedScopeJson,status,NULL bodyMarkdown,NULL testJson,providerId,modelId,errorCode,createdAt FROM study_artifacts WHERE courseId=? AND (? IS NULL OR createdAt<? OR (createdAt=? AND id<?)) ORDER BY createdAt DESC,id DESC LIMIT ?').all(input.courseId, cursor?.at ?? null, cursor?.at ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1);
        const items: Omit<NonNullable<ReturnType<ArtifactRepository['find']>>, 'bodyMarkdown' | 'test'>[] = [];
        let bytes = 0;
        for (const row of rows.slice(0, limit)) {
            const { bodyMarkdown, test, ...summary } = this.parse(row);
            void bodyMarkdown;
            void test;
            const size = Buffer.byteLength(JSON.stringify(summary));
            if (bytes + size > 450000)
                break;
            items.push(summary);
            bytes += size;
        }
        const last = items.at(-1);
        return { items, nextCursor: rows.length > items.length && last ? { at: last.createdAt, id: last.id } : null };
    }
    /** Reads only what `scope` selects; a limit error means the requested scope itself is too large. */
    scopeInputs(courseId: string, scope: GenerationRequest['scope'], weakKeys?: ReadonlySet<string>): ScopeInputs {
        const json = (values: readonly string[]) => JSON.stringify(values);
        const unitsWhere = (where: string, ...values: SQLInputValue[]) => this.db.prepare(`SELECT * FROM study_units su WHERE su.courseId=? AND ${where} ORDER BY su.ordinal,su.id LIMIT 101`).all(courseId, ...values);
        const conceptsWhere = (where: string, ...values: SQLInputValue[]) => this.db.prepare(`SELECT key,unitId FROM study_concepts WHERE courseId=? AND userState!='dismissed' AND ${where} LIMIT 101`).all(courseId, ...values);
        const unitIdsOf = (rows: Record<string, unknown>[], column: string) => json(rows.flatMap(row => row[column] ? [String(row[column])] : []));
        let units: Record<string, unknown>[], concepts: Record<string, unknown>[] | undefined, observations: ScopeInputs['observations'] = [];
        if (scope.kind === 'units')
            units = unitsWhere('su.id IN (SELECT value FROM json_each(?))', json(scope.unitIds));
        else if (scope.kind === 'documents')
            units = unitsWhere('su.id IN (SELECT unitId FROM study_document_units WHERE courseId=? AND documentId IN (SELECT value FROM json_each(?)))', courseId, json(scope.documentIds));
        else if (scope.kind === 'concepts' || scope.kind === 'weak') {
            const keys = scope.kind === 'concepts' ? scope.conceptKeys : [...weakKeys ?? []];
            concepts = conceptsWhere('key IN (SELECT value FROM json_each(?))', json(keys));
            units = concepts.length > 100 ? [] : unitsWhere('su.id IN (SELECT value FROM json_each(?))', unitIdsOf(concepts, 'unitId'));
        }
        else {
            const range = dateRange(scope.fromDate, scope.toDate, scope.timeZone);
            const inRange = `FROM study_observations o JOIN study_jobs j ON j.id=o.jobId JOIN conversations c ON c.id=j.conversationId LEFT JOIN documents d ON d.id=c.documentId JOIN messages u ON u.id=j.userMessageId JOIN messages a ON a.id=j.assistantMessageId JOIN study_chat_links l ON l.conversationId=c.id WHERE o.courseId=? AND (${eligibleSourceSql}) AND j.occurredAt>=? AND j.occurredAt<?`;
            units = unitsWhere(`((coalesce(su.startsAt,'')!='' AND coalesce(su.endsAt,'')!='' AND su.startsAt<? AND su.endsAt>?) OR ((coalesce(su.startsAt,'')='' OR coalesce(su.endsAt,'')='') AND su.id IN (SELECT o.unitId ${inRange})))`, range.to, range.from, courseId, range.from, range.to);
            if (units.length <= 100)
                observations = this.db.prepare(`SELECT o.unitId,min(j.occurredAt) occurredAt ${inRange} AND o.unitId IN (SELECT value FROM json_each(?)) GROUP BY o.unitId`).all(courseId, range.from, range.to, unitIdsOf(units, 'id')) as unknown as ScopeInputs['observations'];
        }
        if (units.length > 100)
            throw new Error('review.scope_limit');
        concepts ??= conceptsWhere('unitId IN (SELECT value FROM json_each(?))', unitIdsOf(units, 'id'));
        const links = this.db.prepare('SELECT du.unitId,du.documentId FROM study_document_units du JOIN documents d ON d.id=du.documentId WHERE du.courseId=? AND d.deletedAt IS NULL AND d.status=\'ready\' AND du.unitId IN (SELECT value FROM json_each(?)) LIMIT 1001').all(courseId, unitIdsOf(units, 'id'));
        if (concepts.length > 100 || links.length > 1000)
            throw new Error('review.scope_limit');
        return { units: units.map(u => ({ id: String(u.id), startsAt: u.startsAt as string | null, endsAt: u.endsAt as string | null, documentIds: links.filter(l => l.unitId === u.id).map(l => String(l.documentId)) })), documents: [...new Set(links.map(l => String(l.documentId)))], concepts: concepts.map(c => ({ key: String(c.key), unitId: c.unitId as string | null, ...(scope.kind === 'weak' ? { weak: true } : {}) })), observations };
    }
    /** Which of `ids` are still ready, linked to a unit of this course. */
    liveDocuments(courseId: string, ids: readonly string[]): string[] {
        return this.db.prepare('SELECT DISTINCT du.documentId FROM study_document_units du JOIN documents d ON d.id=du.documentId WHERE du.courseId=? AND d.deletedAt IS NULL AND d.status=\'ready\' AND du.documentId IN (SELECT value FROM json_each(?))').all(courseId, JSON.stringify(ids)).map(row => String(row.documentId));
    }
}
