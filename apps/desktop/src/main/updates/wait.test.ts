import {expect, it, vi} from 'vitest';
import {waitForUpdateWork} from './wait';
it('bounds a hung producer and supports cancellation', async () => {
  vi.useFakeTimers();
  try {
    const abort = new AbortController();
    const pending = waitForUpdateWork(() => new Promise(() => {}), abort.signal);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe('timeout');
    const cancelled = waitForUpdateWork(() => new Promise(() => {}), abort.signal);
    abort.abort(); expect(await cancelled).toBe('cancelled');
  } finally {vi.useRealTimers();}
});
