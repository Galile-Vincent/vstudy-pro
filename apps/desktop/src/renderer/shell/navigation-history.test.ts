import { describe, expect, it } from 'vitest';
import { documentIdSchema } from '../../shared/domain';
const documentId = documentIdSchema.parse('00000000-0000-4000-a000-000000000001');
import { canMoveHistory, createRouteHistory, historyRoute, moveHistory, pushRoute } from './navigation-history';

describe('route visits', () => {
  it('moves through actual visits without pushing and drops a forward branch', () => {
    const home = createRouteHistory({ view: 'home' });
    const library = pushRoute(home, { view: 'library' });
    const document = pushRoute(library, { view: 'workspace', documentId });
    const courses = pushRoute(document, { view: 'courses', courseId: 'course' });
    const back = moveHistory(courses, 'back');
    expect(back.entries[back.index]).toMatchObject({ view: 'workspace', documentId });
    expect(moveHistory(back, 'forward')).toEqual(courses);
    const branch = pushRoute(back, { view: 'history' });
    expect(branch.entries.map(route => route.view)).toEqual(['home', 'library', 'workspace', 'history']);
    expect(canMoveHistory(branch, 'forward')).toBe(false);
    expect(courses.entries[3]?.view).toBe('courses');
  });
  it('strips actions on initialization and pushes, and excludes welcome', () => {
    const history = createRouteHistory({ view: 'courses', connectSchool: true, aiParse: true });
    expect(history.entries[0]).not.toHaveProperty('connectSchool');
    expect(history.entries[0]).not.toHaveProperty('aiParse');
    expect(pushRoute(history, { view: 'welcome' })).toBe(history);
    const next = pushRoute(history, { view: 'workspace', documentId, aiParse: true });
    expect(next.entries[1]).not.toHaveProperty('aiParse');
    expect(historyRoute({ view: 'welcome' }).view).toBe('home');
  });
  it('deduplicates equivalent queries and action-only changes', () => {
    const history = createRouteHistory({ view: 'library', query: { sort: 'name', folderId: null } });
    expect(pushRoute(history, { view: 'library', query: { folderId: null, sort: 'name' }, aiParse: true })).toBe(history);
  });
  it('clamps both ends and caps memory at 50 visits', () => {
    let history = createRouteHistory({ view: 'home' });
    expect(moveHistory(history, 'back')).toBe(history);
    expect(moveHistory(history, 'forward')).toBe(history);
    for (let index = 0; index < 70; index++) history = pushRoute(history, { view: 'courses', courseId: String(index) });
    expect(history.entries).toHaveLength(50);
    expect(history.index).toBe(49);
    expect(history.entries[0]?.courseId).toBe('20');
  });
});
