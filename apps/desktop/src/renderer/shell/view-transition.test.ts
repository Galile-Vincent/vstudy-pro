// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { transitionTo } from './view-transition';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('never blocks navigation when transition setup throws', () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.startViewTransition = vi.fn(() => { throw new Error('unsupported'); });
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1);
});
it('applies exactly once if the API throws after running its update', () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.startViewTransition = vi.fn(update => { if (typeof update === 'function') void update(); throw new Error('snapshot failure'); });
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1);
});
it('skips the API under reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  document.startViewTransition = vi.fn();
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1); expect(document.startViewTransition).not.toHaveBeenCalled();
});
