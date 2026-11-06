import { expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, dialog: {} }));
import { progressFor } from '../ipc/review-generate';
import { channelPolicy } from '../ipc/register';
import { reviewProgressSchema } from '../../shared/review-generate';
it('isolates coalesced progress to the originating frame and sends terminal immediately', () => { vi.useFakeTimers(); const frame = {}, send = vi.fn(), other = vi.fn(); const event = { senderFrame: frame, sender: { mainFrame: frame, isDestroyed: () => false, send } }; const emit = progressFor(event as never); const value = { requestId: '10000000-0000-4000-8000-000000000001', artifactId: '10000000-0000-4000-8000-000000000002', stage: 'generating' as const, completed: 0, total: 1, errorCode: null }; emit(value); emit(value); emit({ ...value, stage: 'ready', completed: 1 }); vi.runAllTimers(); expect(send.mock.calls.at(-1)?.[1].stage).toBe('ready'); expect(other).not.toHaveBeenCalled(); event.sender.mainFrame = {}; emit({ ...value, stage: 'ready' }); expect(send).toHaveBeenCalledTimes(2); vi.useRealTimers(); });
it('limits expensive channels and validates bounded progress', () => { for (const channel of ['review:artifact:generate', 'review:artifact:retry', 'review:attempt:commit'])
    expect(channelPolicy(channel).requests).toBe(12); expect(reviewProgressSchema.safeParse({}).success).toBe(false); });
