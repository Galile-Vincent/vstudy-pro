// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestPlayer } from './test-player';
import { fakeArtifact, fakeAttemptServer } from './fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

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
