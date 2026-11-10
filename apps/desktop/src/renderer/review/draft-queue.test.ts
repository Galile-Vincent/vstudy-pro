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

it('retries transient failures during the shutdown allowance', async () => {
 vi.useFakeTimers();
 const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
 const queue = draftQueue('attempt', send);
 queue.set('q1', 1);
 const flush = queue.flush(1800);
 await vi.advanceTimersByTimeAsync(100);
 await flush;
 expect(send).toHaveBeenCalledTimes(2);
 expect(queue.answers()).toEqual({});
});
it('reports pending when permanent failures exhaust the shutdown allowance', async () => {
 vi.useFakeTimers();
 const send = vi.fn().mockRejectedValue(new Error('offline'));
 const queue = draftQueue('attempt', send);
 queue.set('q1', 1);
 const { flushDraftQueues } = await import('./draft-queue');
 const flush = flushDraftQueues();
 await vi.advanceTimersByTimeAsync(1800);
 expect(await flush).toBe('pending');
 expect(send.mock.calls.length).toBeGreaterThan(1);
 expect(queue.answers()).toEqual({ q1: 1 });
});

it.each(['attempt_unavailable', 'item_unavailable', 'invalid_answer', 'invalid_sequence', 'answers_locked', 'attempt_committed'])(
 'stops retries and evicts after terminal review.%s', async code => {
 vi.useFakeTimers();
 const send = vi.fn().mockRejectedValueOnce(new Error('offline'))
  .mockRejectedValue(new Error('Error invoking remote method: VSTUDY_STATUS:' + JSON.stringify({ code: 'review.' + code, params: {} })));
 const queue = draftQueue('attempt', send);
 const notice = vi.fn();
 const unsubscribe = queue.subscribe(notice);
 queue.set('q1', 1);
 await queue.flush();
 await vi.advanceTimersByTimeAsync(3000);
 expect(queue.answers()).toEqual({});
 expect(queue.failed).toBe(true);
 const notifications = notice.mock.calls.length;
 await queue.flush();
 expect(notice).toHaveBeenCalledTimes(notifications);
 await vi.advanceTimersByTimeAsync(9000);
 expect(send).toHaveBeenCalledTimes(2);
 unsubscribe();
 expect(draftQueue('attempt', send)).not.toBe(queue);
});

it('mirrors production deletion of the draft sequence and its admitted stale-write limit', async () => {
 const { fakeAttemptServer } = await import('./fake-attempt-server');
 const server = fakeAttemptServer();
 await server.invoke('review:attempt:draft', { itemId: 'q1', answer: 1, seq: 4 });
 await server.invoke('review:attempt:draft', { itemId: 'q1', answer: null, seq: 5 });
 expect(server.state.draftSeqs.q1).toBeUndefined();
 await server.invoke('review:attempt:draft', { itemId: 'q1', answer: 0, seq: 4 });
 expect(server.state.drafts.q1).toBe(0);
});

it('reports a hung write as pending within the renderer allowance', async () => {
 vi.useFakeTimers();
 const queue = draftQueue('attempt', () => new Promise(() => {}));
 queue.set('q1', 1);
 const { flushDraftQueues } = await import('./draft-queue');
 const flush = flushDraftQueues();
 await vi.advanceTimersByTimeAsync(1800);
 expect(await flush).toBe('pending');
 expect(queue.answers()).toEqual({ q1: 1 });
});
