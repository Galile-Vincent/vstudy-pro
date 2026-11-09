// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resetDraftQueues } from './draft-queue';
import { TestPlayer } from './test-player';
import { fakeArtifact, fakeAttemptServer } from './fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
afterEach(() => { cleanup(); vi.resetAllMocks(); resetDraftQueues(); });

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

it.each(modes)('reopens at the first question that is not committed yet (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 server.state.graded.q1 = false; server.state.graded.q2 = true;
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 expect(await screen.findByRole('heading', { name: 'Question 3' })).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'review:previous_item' }));
 expect(await screen.findByRole('heading', { name: 'Question 2' })).toBeTruthy();
});

it.each(modes)('reopens at the first question when every question is committed (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 for (const id of ['q1', 'q2', 'q3']) server.state.graded[id] = true;
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 expect(await screen.findByRole('heading', { name: exam ? 'exams:results' : 'Question 1' })).toBeTruthy();
});

it.each(modes)('moves focus to the question once the attempt has loaded, and again on each new question (%s)', async (_name, exam) => {
 const server = fakeAttemptServer();
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={fakeArtifact(exam)} onRetake={vi.fn()} />);
 const heading = await screen.findByRole('heading', { name: 'Question 1' });
 await waitFor(() => expect(document.activeElement).toBe(heading));
 fireEvent.click(screen.getByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByText('Explanation 1');
 fireEvent.click(screen.getByRole('button', { name: 'review:next_item' }));
 const next = await screen.findByRole('heading', { name: 'Question 2' });
 await waitFor(() => expect(document.activeElement).toBe(next));
});

it('shows a focus indicator on the focused question heading', () => {
 const css = readFileSync('src/renderer/exams/exams.css', 'utf8');
 expect(css).not.toMatch(/\.exam-player h3:focus\s*\{\s*outline:\s*none/);
 expect(css).toMatch(/\.exam-player h3:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
});
