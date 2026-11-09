// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
