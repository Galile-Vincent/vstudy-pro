import { afterEach, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { course as newCourse, seedObservations } from './scale-test-fixture';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse())
    await fn(); });
function tentative(db: DatabaseSync) { db.exec('UPDATE study_chat_links SET confirmed=0,confidence=0.5'); }
it('computes mastery for 3,000 observations over 200 concepts with a constant number of queries', () => {
    const { store, foundation, courseId } = newCourse(cleanup);
    for (let i = 0; i < 200; i++)
        foundation.addConcept({ courseId, label: 'topic' + i });
    seedObservations(store.db, courseId, { count: 3000, perJob: 1, concept: i => 'topic' + (i % 200), at: i => new Date(Date.UTC(2030, 0, 1) + i * 3_600_000).toISOString() });
    tentative(store.db);
    const prepare = vi.spyOn(store.db, 'prepare');
    const started = performance.now();
    const result = foundation.computeCourseMastery(courseId, Date.UTC(2030, 6, 1));
    const elapsed = performance.now() - started;
    expect(result).toHaveLength(200);
    expect(result.every(c => c.mastery.episodeCount > 0)).toBe(true);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(8);
    expect(elapsed).toBeLessThan(5000);
    prepare.mockClear();
    const page = foundation.masteryPage({ courseId, limit: 10 }, Date.UTC(2030, 6, 1));
    expect(page.items).toHaveLength(10);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(10);
});
it('keeps thousands of tentative observations for one concept off a quadratic path', () => {
    const { store, foundation, courseId } = newCourse(cleanup);
    foundation.addConcept({ courseId, label: 'topic' });
    seedObservations(store.db, courseId, { count: 3000, perJob: 1, concept: () => 'topic', at: i => new Date(Date.UTC(2030, 0, 1) + (i + (i < 1500 ? 0 : 720)) * 3_600_000).toISOString() });
    tentative(store.db);
    const started = performance.now();
    const [result] = foundation.computeCourseMastery(courseId, Date.UTC(2030, 6, 1));
    expect(result?.mastery.episodeCount).toBe(2);
    expect(performance.now() - started).toBeLessThan(5000);
});
