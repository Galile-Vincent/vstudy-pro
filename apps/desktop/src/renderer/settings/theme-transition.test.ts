// @vitest-environment jsdom
/** User-visible transition lifecycle, cancellation, and immediate accessibility behavior. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createThemeTransition } from './theme-transition';

beforeEach(() => {
  vi.useFakeTimers();
  delete document.documentElement.dataset.themeTransition;
  Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
  vi.stubGlobal('matchMedia', () => ({matches:false}));
  Object.defineProperty(document, 'startViewTransition', {value:undefined, writable:true, configurable:true});
});
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});

it('paints startup, system sync, and reduced motion immediately', () => {
  const start = vi.fn();
  document.startViewTransition = start;
  const run = createThemeTransition();
  const apply = vi.fn();
  run(apply, false);
  vi.stubGlobal('matchMedia', () => ({matches:true}));
  run(apply, true);
  expect(apply).toHaveBeenCalledTimes(2);
  expect(start).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.themeTransition).toBeUndefined();
});

it('interpolates fallback colors only for the duration of a user change', () => {
  const run = createThemeTransition();
  run(() => document.documentElement.style.setProperty('--background', '#123456'), true);
  expect(document.documentElement.style.getPropertyValue('--background')).toBe('#123456');
  expect(document.documentElement.dataset.themeTransition).toBe('tokens');
  vi.advanceTimersByTime(320);
  expect(document.documentElement.dataset.themeTransition).toBeUndefined();
});

it('restarts fallback cleanup when the user drags a slider', () => {
  const run = createThemeTransition();
  run(() => {}, true);
  vi.advanceTimersByTime(200);
  run(() => {}, true);
  vi.advanceTimersByTime(120);
  expect(document.documentElement.dataset.themeTransition).toBe('tokens');
  vi.advanceTimersByTime(200);
  expect(document.documentElement.dataset.themeTransition).toBeUndefined();
});

it('keeps the latest selection when a snapshot callback arrives late', async () => {
  const updates: (() => void)[] = [];
  const finishes: (() => void)[] = [];
  const skip = vi.fn();
  document.startViewTransition = vi.fn((update: () => void) => {
    updates.push(update);
    return {ready:Promise.resolve(), finished:new Promise<void>(resolve => finishes.push(resolve)), skipTransition:skip} as unknown as ViewTransition;
  }) as typeof document.startViewTransition;
  const run = createThemeTransition();
  const old = vi.fn(), latest = vi.fn();
  run(old, true);
  run(latest, true);
  updates[0]!(); updates[1]!();
  expect(skip).toHaveBeenCalledOnce();
  expect(old).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
  finishes[0]!();
  await vi.runAllTimersAsync();
  expect(document.documentElement.dataset.themeTransition).toBe('view');
  finishes[1]!();
  await vi.runAllTimersAsync();
  expect(document.documentElement.dataset.themeTransition).toBeUndefined();
});

it('falls back if Chromium refuses a snapshot', () => {
  document.startViewTransition = vi.fn(() => {throw new Error('snapshot unavailable');});
  const apply = vi.fn();
  createThemeTransition()(apply, true);
  expect(apply).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.themeTransition).toBe('tokens');
});

it('a nonanimated update cancels an in-flight user change', () => {
  const run = createThemeTransition();
  run(() => {}, true);
  const apply = vi.fn();
  run(apply, false);
  expect(apply).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.themeTransition).toBeUndefined();
});
