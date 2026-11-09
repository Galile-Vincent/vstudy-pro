// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestPlayer } from './test-player';
import { fakeArtifact, fakeAttemptServer } from './fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const modes = [['review', false], ['exam', true]] as const;

it.each(modes)('retry commits the answer currently selected, not the one saved before the failure (%s)', async (_name, exam) => {
 const server = fakeAttemptServer({ commitFailures: 1 });
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Alpha/));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 await screen.findByText('Explanation 1');
 expect(server.state.answers.q1).toBe(1);
 expect(server.state.graded.q1).toBe(true);
});

it.each(modes)('keeps an answer committed once final when the commit reply was lost (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 const commit = server.invoke;
 let lost = true;
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  const reply = await commit(channel, request);
  if (channel === 'review:attempt:commit' && lost) { lost = false; throw new Error('reply lost'); }
  return reply;
 });
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Alpha/));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByRole('alert');
 expect(server.state.graded.q1).toBe(false);
 fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 await screen.findByText('Explanation 1');
 expect(server.state.answers.q1).toBe(0);
 expect(screen.queryByRole('alert')).toBeNull();
});

it.each(modes)('says which answer was graded when the lost commit is found after the selection changed (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 let lost = true;
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  const reply = await server.invoke(channel, request);
  if (channel === 'review:attempt:commit' && lost) { lost = false; throw new Error('reply lost'); }
  return reply;
 });
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Alpha/));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 await screen.findByText('review:graded_earlier');
 expect(server.state.answers.q1).toBe(0);
 expect(server.state.graded.q1).toBe(false);
});

const settled = { timeout: 3000 };

it.each(modes)('saves a selection as a draft without answering or grading (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 expect(server.called('review:attempt:draft')).toHaveLength(0);
 await waitFor(() => expect(server.state.drafts.q1).toBe(1), settled);
 expect(server.called('review:attempt:answer')).toHaveLength(0);
 expect(server.called('review:attempt:commit')).toHaveLength(0);
 expect(server.state.answers).toEqual({});
});

it.each(modes)('restores a draft after the player remounts, and flushes it on unmount (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 const first = render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 first.unmount();
 await waitFor(() => expect(server.state.drafts.q1).toBe(1));
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 expect((await screen.findByLabelText(/Beta/) as HTMLInputElement).checked).toBe(true);
 expect(server.called('review:attempt:commit')).toHaveLength(0);
});

it.each(modes)('keeps an unsent draft when moving to the previous question and back (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByText('Explanation 1');
 fireEvent.click(screen.getByRole('button', { name: 'review:next_item' }));
 fireEvent.click(await screen.findByLabelText(/Alpha/));
 fireEvent.click(screen.getByRole('button', { name: 'review:previous_item' }));
 await screen.findByText('Explanation 1');
 fireEvent.click(screen.getByRole('button', { name: 'review:next_item' }));
 expect((await screen.findByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(true);
 expect(server.called('review:attempt:answer')).toHaveLength(1);
});

it.each(modes)('tells the user when a draft cannot be saved and clears it once saving works (%s)', async (_name, exam) => {
 const server = fakeAttemptServer({ draftFailures: 1 });
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText(/Beta/));
 await screen.findByText('review:draft_save_failed', {}, settled);
 expect(screen.getByText('review:draft_save_failed').closest('[role="status"]')).toBeTruthy();
 fireEvent.click(screen.getByLabelText(/Alpha/));
 await waitFor(() => expect(screen.queryByText('review:draft_save_failed')).toBeNull(), settled);
 expect(server.state.drafts.q1).toBe(0);
});
