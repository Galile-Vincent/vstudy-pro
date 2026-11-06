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
it('returns a typed error only when the requested scope itself is too large', () => {
    const { store, courseId, repo } = newCourse(cleanup);
    const insert = store.db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey,sourceSectionId,startsAt,endsAt) VALUES(?,?,'moodle',?,?,?,?,'2030-01-02T00:00:00.000Z','2030-01-03T00:00:00.000Z')");
    for (let i = 0; i < 101; i++)
        insert.run(randomUUID(), courseId, i, 'Week ' + i, 'k' + i, 's' + i);
    const service = noteService(repo, document(store).excerpt);
    expect(() => service.generate(request(courseId, { kind: 'dates', fromDate: '2030-01-01', toDate: '2030-01-08', timeZone: 'UTC' }))).toThrow('review.scope_limit');
    expect(() => service.generate(request(courseId, { kind: 'dates', fromDate: '2031-01-01', toDate: '2031-01-08', timeZone: 'UTC' }))).not.toThrow();
});
