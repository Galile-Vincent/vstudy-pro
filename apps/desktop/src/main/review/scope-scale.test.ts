import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { openStore } from '../db';
import { course as newCourse, seedObservations } from './scale-test-fixture';
import type { GenerationRequest } from '../../shared/review-generate';
import { ArtifactRepository } from './artifact-repository';
import { GenerationService } from './generate';
import { FakeAdmission } from './admission-port';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse())
    await fn(); });
function document(store: ReturnType<typeof openStore>) {
    const id = randomUUID();
    store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?, 'Physics','physics.pdf',?,'/tmp/source','application/pdf','ready','/tmp/content','2026-11-06T00:00:00Z')").run(id, id);
    return { id, excerpt: { documentId: id, version: 'original' as const, excerptHash: 'a'.repeat(64), text: 'Force causes acceleration. Motion changes position.' } };
}
function noteService(repo: ArtifactRepository, excerpt: ReturnType<typeof document>['excerpt']) {
    const service = new GenerationService(repo, { admission: new FakeAdmission(), readExcerpt: async () => excerpt, estimate: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 1 }), call: async () => JSON.stringify({ bodyMarkdown: `Force [src:${excerpt.documentId}]`, citations: [{ documentId: excerpt.documentId, version: excerpt.version, excerptHash: excerpt.excerptHash, quote: 'Force causes acceleration.' }], omitted: [] }) });
    cleanup.push(() => service.dispose());
    return service;
}
const request = (courseId: string, scope: GenerationRequest['scope']): GenerationRequest => ({ requestId: randomUUID(), courseId, kind: 'note', title: 'Note', scope, idempotencyKey: randomUUID(), providerId: 'openai-api', modelId: 'gpt-5.4', locale: 'en' });
it('generates a note for one document while 5,000 unrelated eligible observations exist', async () => {
    const { store, foundation, courseId, repo } = newCourse(cleanup);
    const doc = document(store);
    foundation.linkDocument(courseId, doc.id, ['Force']);
    foundation.addConcept({ courseId, label: 'History' });
    seedObservations(store.db, courseId, { count: 5000, concept: i => 'c' + (i % 5), at: () => '2030-01-01T00:00:00.000Z' });
    const service = noteService(repo, doc.excerpt);
    const artifact = service.generate(request(courseId, { kind: 'documents', documentIds: [doc.id] }));
    await service.waitForIdle();
    expect(repo.find(artifact.id)).toMatchObject({ status: 'ready', errorCode: null });
});
it('resolves an undated unit by time-qualified observations among 5,000 and rejects an out-of-range window', async () => {
    const { store, foundation, courseId, repo } = newCourse(cleanup);
    const doc = document(store);
    foundation.linkDocument(courseId, doc.id, ['Force']);
    const unit = String(store.db.prepare("SELECT id FROM study_units WHERE courseId=? AND kind='document'").get(courseId)!.id);
    seedObservations(store.db, courseId, { count: 5000, unitId: unit, concept: i => 'c' + (i % 5), at: i => i < 4990 ? '2029-06-01T00:00:00.000Z' : '2030-01-03T00:00:00.000Z' });
    const service = noteService(repo, doc.excerpt);
    const inside = service.generate(request(courseId, { kind: 'dates', fromDate: '2030-01-01', toDate: '2030-01-08', timeZone: 'UTC' }));
    await service.waitForIdle();
    expect(repo.find(inside.id)).toMatchObject({ status: 'ready' });
    expect(repo.find(inside.id)?.resolvedScope.assumptions.join()).toContain('Undated units based on when you asked');
    const outside = service.generate(request(courseId, { kind: 'dates', fromDate: '2031-01-01', toDate: '2031-01-08', timeZone: 'UTC' }));
    await service.waitForIdle();
    expect(repo.find(outside.id)).toMatchObject({ status: 'failed', errorCode: 'review.needs_source_selection' });
});
it('bounds resolved units instead of rejecting a larger date window', () => {
    const { store, courseId, repo } = newCourse(cleanup);
    const insert = store.db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey,sourceSectionId,startsAt,endsAt) VALUES(?,?,'moodle',?,?,?,?,'2030-01-02T00:00:00.000Z','2030-01-03T00:00:00.000Z')");
    for (let i = 0; i < 101; i++)
        insert.run(randomUUID(), courseId, i, 'Week ' + i, 'k' + i, 's' + i);
    const service = noteService(repo, document(store).excerpt);
    expect(service.generate(request(courseId, { kind: 'dates', fromDate: '2030-01-01', toDate: '2030-01-08', timeZone: 'UTC' })).resolvedScope.unitIds).toHaveLength(100);
    expect(() => service.generate(request(courseId, { kind: 'dates', fromDate: '2031-01-01', toDate: '2031-01-08', timeZone: 'UTC' }))).not.toThrow();
});

for (const count of [101, 120]) for (const kind of ['weak', 'units', 'documents', 'dates'] as const) {
    it(`generates ${kind} from ${count} concepts without a scope-limit failure`, async () => {
        const { store, foundation, courseId, repo } = newCourse(cleanup);
        const doc = document(store);
        foundation.linkDocument(courseId, doc.id);
        for (let i = 0; i < count; i++) foundation.addConcept({ courseId, label: `Topic ${i}` });
        const service = noteService(repo, doc.excerpt);
        const unitId = String(store.db.prepare('SELECT id FROM study_units WHERE courseId=?').get(courseId)!.id);
        store.db.prepare('UPDATE study_units SET startsAt=?, endsAt=? WHERE id=?').run('2030-01-02T00:00:00Z', '2030-01-03T00:00:00Z', unitId);
        if (kind === 'weak') seedObservations(store.db, courseId, { count: count * 2, perJob: 1,
            concept: i => `topic ${i % count}`,
            at: i => new Date(Date.now() - (i < count ? 2 : 1) * 86400000).toISOString() });
        const scope = kind === 'weak' ? { kind } : kind === 'units' ? { kind, unitIds: [unitId] }
            : kind === 'documents' ? { kind, documentIds: [doc.id] }
            : { kind, fromDate: '2030-01-01', toDate: '2030-01-08', timeZone: 'UTC' };
        const artifact = service.generate(request(courseId, scope));
        expect(artifact.resolvedScope.conceptKeys).toHaveLength(100);
        expect(artifact.resolvedScope.omittedConcepts).toBe(count - 100);
        await service.waitForIdle();
        expect(repo.find(artifact.id)).toMatchObject({ status: 'ready', errorCode: null });
    });
}
it('includes a newer high-risk concept ahead of older low-risk concepts at the backend cap', () => {
    const { store, foundation, courseId, repo } = newCourse(cleanup);
    const doc = document(store);
    foundation.linkDocument(courseId, doc.id);
    for (let i = 0; i < 120; i++) foundation.addConcept({ courseId, label: `Topic ${i}` });
    seedObservations(store.db, courseId, { count: 2, perJob: 1, concept: () => 'topic 119',
        at: i => new Date(Date.now() - (2 - i) * 86400000).toISOString() });
    const preview = noteService(repo, doc.excerpt).preview(courseId, { kind: 'documents', documentIds: [doc.id] });
    expect(preview.conceptKeys[0]).toBe('topic 119');
    expect(preview.conceptKeys).toHaveLength(100);
    expect(preview.omittedConcepts).toBe(20);
});
