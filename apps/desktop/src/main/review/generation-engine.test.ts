import type { StudyResolvedScope } from '../../shared/review-artifacts';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { openStore } from '../db';
import { ReviewRepository } from './repository';
import { ArtifactRepository } from './artifact-repository';
import { Attempts } from './attempts';
import { GenerationService } from './generate';
import { FakeAdmission } from './admission-port';
import type { GenerationRequest } from '../../shared/review-generate';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse())
    await fn(); });
function setup() { const store = openStore(':memory:'); cleanup.push(() => store.close()); const foundation = new ReviewRepository(store.db); const course = foundation.createCourse({ title: 'Physics' }); const repo = new ArtifactRepository(store.db); const request: GenerationRequest = { requestId: randomUUID(), courseId: course.id, kind: 'test', title: 'Practice', scope: { kind: 'weak' }, idempotencyKey: randomUUID(), providerId: 'openai-api', modelId: 'gpt-5.4', locale: 'en' }; const snapshot: StudyResolvedScope = { unitIds: [], documentIds: [], conceptKeys: [], from: null, to: null, timeZone: 'UTC', sources: [], assumptions: [] }; return { store, repo, request, snapshot }; }
it('locks answers, grades in main, confirms once and excludes reported bad items', () => { const { repo, request, snapshot } = setup(); const token = randomUUID(), artifact = repo.create(request, snapshot, token); const source = { documentId: randomUUID(), version: 'original' as const, excerptHash: 'a'.repeat(64), quote: 'source' }; repo.finish(artifact.id, token, { test: { version: 1, items: [{ id: 'q1', conceptKey: 'force', stem: 'Is force measured?', type: 'true_false', answer: true, explanation: 'Source', source }] } }); const engine = new Attempts(repo); const attempt = engine.start(artifact.id); engine.answer(attempt.id, 'q1', false); expect(engine.commit(attempt.id).results[0]?.correct).toBe(false); expect(() => engine.answer(attempt.id, 'q1', true)).toThrow('locked'); expect(engine.commit(attempt.id).phase).toBe('graded'); const first = engine.confirm(attempt.id); expect(engine.confirm(attempt.id)).toEqual(first); expect(repo.db.prepare('SELECT count(*) n FROM study_attempt_items WHERE appliedAt IS NOT NULL').get()?.n).toBe(1); engine.reportBad(attempt.id, 'q1'); expect(repo.db.prepare('SELECT appliedAt FROM study_attempt_items').get()?.appliedAt).toBeNull(); });
it('fences stale generation attempts and recovers abandoned generation', () => { const { repo, request, snapshot } = setup(); const token = randomUUID(), artifact = repo.create(request, snapshot, token); repo.cancel(artifact.id); repo.retry(artifact.id, 'new-token'); repo.fail(artifact.id, token, 'review.old_failure'); expect(repo.find(artifact.id)?.status).toBe('generating'); repo.recover(); repo.finish(artifact.id, 'new-token', { bodyMarkdown: 'late' }); expect(repo.find(artifact.id)?.status).toBe('interrupted'); });
it('does not dispatch without source excerpts and recovers terminal state without a subscriber', async () => { const { repo, request } = setup(); let calls = 0; const service = new GenerationService(repo, { admission: new FakeAdmission(), readExcerpt: async () => { throw Error('unexpected'); }, estimate: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 1 }), call: async () => { calls++; return ''; } }); cleanup.push(() => service.dispose()); const artifact = service.generate(request); await service.waitForIdle(); expect(calls).toBe(0); expect(repo.find(artifact.id)?.errorCode).toBe('review.needs_source_selection'); expect(service.generate(request).id).toBe(artifact.id); });
it('unknown prices fail closed and settlement is idempotent', () => { const admission = new FakeAdmission(); expect(() => admission.reserve({ inputTokens: 1, outputTokens: 1, costUsd: undefined })).toThrow('budget_unknown'); const estimate = { inputTokens: 1, outputTokens: 1, costUsd: 1 }; const handle = admission.reserve(estimate); admission.settle(handle, estimate); admission.settle(handle, estimate); expect(admission.settled).toHaveLength(1); });
function materials() { const context = setup(); const { request, store } = context; const id = randomUUID(); store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?, 'Physics','physics.pdf',?,'/tmp/source','application/pdf','ready','/tmp/content','2026-11-06T00:00:00Z')").run(id, id); const foundation = new ReviewRepository(store.db); foundation.linkDocument(request.courseId, id, ['Force', 'Motion']); request.scope = { kind: 'documents', documentIds: [id] }; const excerpt = { documentId: id, version: 'original' as const, excerptHash: 'a'.repeat(64), text: 'Force causes acceleration. Motion changes position.' }; return { ...context, excerpt }; }
it.each(['offline', 'unknown'] as const)('persists a retryable failed artifact on %s', async (reason) => { const { repo, request, excerpt } = materials(); const admission = new FakeAdmission(); let calls = 0; const service = new GenerationService(repo, { admission, readExcerpt: async () => excerpt, estimate: () => ({ inputTokens: 10, outputTokens: 10, costUsd: reason === 'unknown' ? undefined : 1 }), call: async () => { calls++; throw Error('offline'); } }); cleanup.push(() => service.dispose()); const artifact = service.generate(request); await service.waitForIdle(); expect(repo.find(artifact.id)?.status).toBe('failed'); expect(calls).toBe(reason === 'offline' ? 1 : 0); expect(admission.pending.size).toBe(0); service.retry(artifact.id, randomUUID(), 'en'); await service.waitForIdle(); expect(calls).toBe(reason === 'offline' ? 2 : 0); });
it('meters two item retries then drops unsupported items with coverage warnings', async () => { const { repo, request, excerpt } = materials(); const admission = new FakeAdmission(); let calls = 0; const service = new GenerationService(repo, { admission, readExcerpt: async () => excerpt, estimate: () => ({ inputTokens: 10, outputTokens: 10, costUsd: 1 }), call: async (prompt) => { calls++; const data = JSON.parse(prompt.split('<UNTRUSTED_REVIEW_DATA>\n')[1]!.split('\n</UNTRUSTED_REVIEW_DATA>')[0]!); return JSON.stringify({ version: 1, items: data.blueprint.map((slot: {
            id: string;
            type: string;
            conceptKey: string;
            bloom: string;
            difficulty: string;
        }) => ({ ...slot, stem: 'Question ' + slot.id, answer: slot.type === 'mcq' ? 0 : slot.type === 'cloze' ? 'force' : true, ...(slot.type === 'mcq' ? { options: ['force', 'speed', 'power', 'other'], optionRationales: ['why', 'why', 'why', 'why'] } : slot.type === 'cloze' ? { alternatives: [] } : {}), explanation: 'source', source: { documentId: excerpt.documentId, version: excerpt.version, excerptHash: excerpt.excerptHash, quote: slot.id === 'q1' ? 'Force causes acceleration.' : 'invented quote' } })) }); } }); cleanup.push(() => service.dispose()); const artifact = service.generate(request); await service.waitForIdle(); const result = repo.find(artifact.id); expect(result?.status).toBe('ready'); expect(result?.test?.items).toHaveLength(1); expect(result?.test?.warnings).toHaveLength(7); expect(calls).toBe(6); expect(admission.settled).toHaveLength(calls); });
it('aborts and fences late provider output during suspension', async () => { const { repo, request, excerpt } = materials(); let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); let started!: () => void; const startedPromise = new Promise<void>(resolve => { started = resolve; }); const admission = new FakeAdmission(); const service = new GenerationService(repo, { admission, readExcerpt: async () => excerpt, estimate: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 1 }), call: async () => { started(); await pending; return '{}'; } }); cleanup.push(() => service.dispose()); const artifact = service.generate(request); await startedPromise; service.suspend(); expect(() => service.generate({ ...request, idempotencyKey: randomUUID() })).toThrow('suspended'); release(); await service.waitForIdle(); expect(repo.find(artifact.id)?.status).toBe('interrupted'); expect(admission.pending.size).toBe(0); });
it('deduplicates retake stems across generations', async () => { const { repo, request, snapshot } = setup(); const artifact = repo.create(request, snapshot, 'token'); const source = { documentId: randomUUID(), version: 'original' as const, excerptHash: 'a'.repeat(64), quote: 'source' }; repo.finish(artifact.id, 'token', { test: { version: 1, excludedStemHashes: ['b'.repeat(64)], items: [{ id: 'q1', conceptKey: 'force', stem: 'Ｗhat is force?', type: 'true_false', answer: true, explanation: 'Source', source }] } }); const attempts = new Attempts(repo); const attempt = attempts.start(artifact.id); attempts.commit(attempt.id); attempts.confirm(attempt.id); const retake = attempts.retake(attempt.id); expect(retake.conceptKeys).toEqual(['force']); expect(retake.excludedStems).toHaveLength(2); expect(retake.excludedStems).toContain('b'.repeat(64)); });
it('rejects generation beyond the in-flight cap before creating more artifacts', () => { const { repo, request } = setup(); const service = new GenerationService(repo, { admission: new FakeAdmission(), readExcerpt: async () => { throw Error('unexpected'); }, estimate: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 1 }), call: async () => '' }); cleanup.push(() => service.dispose()); service.generate(request); service.generate({ ...request, idempotencyKey: randomUUID() }); expect(() => service.generate({ ...request, idempotencyKey: randomUUID() })).toThrow('review.busy'); expect(repo.list({ courseId: request.courseId }).items).toHaveLength(2); });
it('changes W1 computed mastery only on confirmation and reverses it on deletion', () => {
    const { repo, request, snapshot } = setup();
    const foundation = new ReviewRepository(repo.db);
    foundation.addConcept({ courseId: request.courseId, label: 'force' });
    const risk = () => foundation.computeCourseMastery(request.courseId, Date.now() + 1000)[0]!.mastery.risk;
    const baseline = risk();
    const artifact = repo.create(request, snapshot, 'token');
    repo.finish(artifact.id, 'token', { test: { version: 1, items: [{ id: 'q', conceptKey: 'force', stem: 'Force?', type: 'true_false', answer: true, explanation: 'source', source: { documentId: randomUUID(), version: 'original', excerptHash: 'a'.repeat(64), quote: 'source' } }] } });
    const engine = new Attempts(repo), attempt = engine.start(artifact.id);
    engine.commit(attempt.id);
    expect(risk()).toBe(baseline);
    engine.confirm(attempt.id);
    expect(risk()).toBeGreaterThan(baseline);
    engine.confirm(attempt.id);
    expect(repo.db.prepare('SELECT count(*) n FROM study_attempt_items WHERE appliedAt IS NOT NULL').get()?.n).toBe(1);
    repo.delete(artifact.id);
    expect(risk()).toBe(baseline);
});
it('caps artifact page bytes and advances a keyset cursor without reading bodies', () => {
    const { repo, request, snapshot } = setup();
    snapshot.assumptions = Array.from({ length: 50 }, () => 'x'.repeat(500));
    for (let i = 0; i < 20; i++) repo.create({ ...request, idempotencyKey: randomUUID() }, snapshot, randomUUID());
    const page = repo.list({ courseId: request.courseId, limit: 100 });
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(451000);
    expect(page.items.length).toBeLessThan(20);
    expect(page.nextCursor).not.toBeNull();
    const next = repo.list({ courseId: request.courseId, limit: 100, cursor: page.nextCursor! });
    expect(page.items.length + next.items.length).toBe(20);
    expect(next.items.some(item => page.items.some(previous => previous.id === item.id))).toBe(false);
});
