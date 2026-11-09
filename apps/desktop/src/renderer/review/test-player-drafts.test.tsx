// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestPlayer } from './test-player';
import { resetDraftQueues } from './draft-queue';
import { fakeArtifact, fakeAttemptServer } from './fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); resetDraftQueues(); });

const modes = [['review', false], ['exam', true]] as const;
type Held = { request: Record<string, unknown>; ok: () => void; fail: () => void };

function gatedServer(holdFirst: number) {
 const server = fakeAttemptServer();
 const held: Held[] = [];
 let drafts = 0;
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  if (channel !== 'review:attempt:draft' || ++drafts > holdFirst) return server.invoke(channel, request);
  await new Promise<void>((resolve, reject) => held.push({ request, ok: resolve, fail: () => reject(new Error('offline')) }));
  return server.invoke(channel, request);
 });
 return { server, held };
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it.each(modes)('never lets an older failed draft overwrite a newer saved one (%s)', async (_name, exam) => {
 const { server, held } = gatedServer(1);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const alpha = await screen.findByLabelText(/Alpha/);
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 fireEvent.click(alpha);
 await tick(1000);
 expect(held).toHaveLength(1);
 fireEvent.click(screen.getByLabelText(/Beta/));
 await tick(1000);
 await act(async () => { held[0]!.fail(); });
 await tick(10_000);
 expect(server.state.drafts.q1).toBe(1);
 expect((screen.getByLabelText(/Beta/) as HTMLInputElement).checked).toBe(true);
});

it.each(modes)('keeps retrying a draft that failed while leaving, and shows it again on return (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 const first = render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const alpha = await screen.findByLabelText(/Alpha/);
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 fireEvent.click(alpha);
 await tick(1000);
 expect(server.state.drafts.q1).toBe(0);
 server.state.draftFailures = 1;
 fireEvent.click(screen.getByLabelText(/Beta/));
 first.unmount();
 await tick(0);
 expect(server.state.drafts.q1).toBe(0);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 await tick(0);
 expect((screen.getByLabelText(/Beta/) as HTMLInputElement).checked).toBe(true);
 expect(screen.getByText('review:draft_save_failed')).toBeTruthy();
 await tick(3500);
 expect(server.state.drafts.q1).toBe(1);
 expect(screen.queryByText('review:draft_save_failed')).toBeNull();
});

it.each(modes)('retries a draft that failed while leaving even if the player never returns (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 const view = render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const alpha = await screen.findByLabelText(/Alpha/);
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 server.state.draftFailures = 1;
 fireEvent.click(alpha);
 view.unmount();
 await tick(0);
 expect(server.state.drafts.q1).toBeUndefined();
 await tick(3500);
 expect(server.state.drafts.q1).toBe(0);
});
