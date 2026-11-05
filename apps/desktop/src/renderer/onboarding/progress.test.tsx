// @vitest-environment jsdom
/** Learning state survives reload, rejects corrupt profiles, and preserves explicit dismissals. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.stubGlobal('localStorage', window.sessionStorage); localStorage.clear(); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });
async function snapshot() {
  const progress = await import('./progress');
  return { ...progress, value: progress.getLearningProgress() };
}
it('resumes the saved named step and goal after a module reload', async () => {
  const state = await snapshot();
  state.saveProgress({ step: 'start', goal: 'sample', status: 'paused', documentId: '11111111-1111-4111-a111-111111111111' as import('../../shared').Document['id'] });
  vi.resetModules();
  expect((await snapshot()).value).toMatchObject({ step: 'start', goal: 'sample', status: 'paused', documentId: '11111111-1111-4111-a111-111111111111' });
});
it('starts safely when stored progress is corrupt or from an unknown version', async () => {
  localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({ version: 999, step: 'unknown' }));
  expect((await snapshot()).value).toMatchObject({ step: 'welcome', goal: 'sample', done: [], dismissed: [] });
});
it('marks checklist entries once and retains dismissed hints on restart', async () => {
  const state = await snapshot();
  state.markLearned('document'); state.markLearned('document');
  state.saveProgress({ dismissed: ['workspace'] });
  vi.resetModules();
  expect((await snapshot()).value).toMatchObject({ done: ['document'], dismissed: ['workspace'] });
});
it('does not claim a save succeeded when storage rejects it', async () => {
  const state = await snapshot();
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk'); });
  expect(() => state.saveProgress({ step: 'goal' })).toThrow('disk');
  setter.mockRestore();
  expect((await snapshot()).value.step).toBe('welcome');
});
