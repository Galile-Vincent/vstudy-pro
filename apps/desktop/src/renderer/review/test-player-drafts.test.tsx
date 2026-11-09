// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestPlayer } from './test-player';
import { resetDraftQueues } from './draft-queue';
import { fakeArtifact, fakeAttemptServer } from './fake-attempt-server';
const { invoke, flushRequest } = vi.hoisted(() => {
 const flushRequest = { listener: null as null | (() => Promise<'clean' | 'pending'>) };
 return { invoke: vi.fn(), flushRequest };
});
vi.mock('../bridge', () => ({
 desktop: { invoke, onDraftFlushRequest: (listener: () => Promise<'clean' | 'pending'>) => { flushRequest.listener = listener; return () => {}; } },
}));
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

it.each(modes)('writes a selection straight away, before any debounce (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 await act(async () => { await Promise.resolve(); });
 expect(server.state.drafts.q1).toBe(1);
});

it.each(modes)('coalesces quick changes to one question into few writes, ending on the last (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const alpha = await screen.findByLabelText(/Alpha/);
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 for (const label of [/Beta/, /Alpha/, /Beta/, /Alpha/]) fireEvent.click(screen.getByLabelText(label));
 expect(alpha).toBeTruthy();
 await tick(200);
 expect(server.state.drafts.q1).toBe(0);
 expect(server.called('review:attempt:draft').length).toBeLessThanOrEqual(2);
});

it.each(modes)('flushes a selection made just before quitting when main asks, before IPC closes (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 let closed = false;
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  if (closed) throw new Error('ipc disposed');
  return server.invoke(channel, request);
 });
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const beta = await screen.findByLabelText(/Beta/);
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 fireEvent.click(beta);
 fireEvent.click(screen.getByLabelText(/Alpha/));
 await act(async () => { await flushRequest.listener?.(); });
 closed = true;
 expect(server.state.drafts.q1).toBe(0);
});

it.each(modes)('waits for a write that is already in flight when main asks to flush (%s)', async (_name, exam) => {
 const { server, held } = gatedServer(1);
 let closed = false;
 const inner = invoke.getMockImplementation()!;
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  if (closed) throw new Error('ipc disposed');
  return inner(channel, request);
 });
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 await act(async () => { await Promise.resolve(); });
 expect(held).toHaveLength(1);
 fireEvent.click(screen.getByLabelText(/Alpha/));
 let acknowledged = false;
 const request = flushRequest.listener!().then(() => { acknowledged = true; });
 await act(async () => { await Promise.resolve(); });
 expect(acknowledged).toBe(false);
 await act(async () => { held[0]!.ok(); await request; });
 closed = true;
 expect(server.state.drafts.q1).toBe(0);
});
