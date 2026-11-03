import { afterEach, expect, it, vi } from 'vitest';
import { DemoPlayer, script } from './demo-player';
afterEach(() => vi.useRealTimers());
it('preserves remaining delay across pauses and stops after three complete scripts', () => {
  vi.useFakeTimers(); const emit = vi.fn(); const player = new DemoPlayer(emit);
  player.setPlaying(true); vi.advanceTimersByTime(500); player.setPlaying(false);
  vi.advanceTimersByTime(20_000); expect(emit).toHaveBeenLastCalledWith('enter');
  player.setPlaying(true); vi.advanceTimersByTime(399); expect(emit).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); expect(emit).toHaveBeenLastCalledWith('select');
  vi.runAllTimers(); expect(emit.mock.calls.map(([step]) => step)).toEqual([...Array.from({ length: 3 }, () => script.map(([step]) => step)).flat(), 'highlight']);
  expect(vi.getTimerCount()).toBe(0);
  player.replay(); player.setPlaying(true); vi.advanceTimersByTime(900); expect(emit).toHaveBeenLastCalledWith('select'); player.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it('finishes in a static meaningful frame with no timers', () => {
  vi.useFakeTimers(); const emit = vi.fn(); const player = new DemoPlayer(emit);
  player.setPlaying(true); player.finish(); expect(emit).toHaveBeenLastCalledWith('highlight'); expect(vi.getTimerCount()).toBe(0);
});
