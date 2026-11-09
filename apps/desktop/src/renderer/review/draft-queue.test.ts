import { afterEach, expect, it, vi } from 'vitest';
import { draftQueue, resetDraftQueues } from './draft-queue';

afterEach(() => { resetDraftQueues(); vi.useRealTimers(); });

it('continues saving after empty flushes interleaved with writes', async () => {
 const send = vi.fn().mockResolvedValue(undefined);
 const queue = draftQueue('attempt', send);
 const unsubscribe = queue.subscribe(() => {});
 await queue.flush();
 for (const answer of [0, 1, 0]) {
  queue.set('q1', answer);
  await queue.flush();
  await queue.flush();
 }
 expect(send.mock.calls.map(call => call[1])).toEqual([0, 1, 0]);
 unsubscribe();
 expect(draftQueue('attempt', send)).not.toBe(queue);
});

it('flushes the latest value after an in-flight write before acknowledging', async () => {
 let finish = () => {};
 const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }))
  .mockResolvedValue(undefined);
 const queue = draftQueue('attempt', send);
 queue.set('q1', 0);
 await Promise.resolve();
 queue.set('q1', 1);
 let acknowledged = false;
 const flush = queue.flush().then(() => { acknowledged = true; });
 await Promise.resolve();
 expect(acknowledged).toBe(false);
 finish();
 await flush;
 expect(send.mock.calls.map(call => call[1])).toEqual([0, 1]);
 expect(queue.answers()).toEqual({});
});
