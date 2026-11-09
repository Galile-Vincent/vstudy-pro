// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExamsView } from './index';
import { resetDraftQueues } from '../review/draft-queue';
import { TestPlayer } from '../review/test-player';
import { fakeArtifact, fakeAttemptServer } from '../review/fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); resetDraftQueues(); });

const exam = fakeArtifact(true);
const historyRow = { artifact: { ...exam, test: undefined }, attempt: null };
function bridge(options: { history?: () => unknown } = {}) {
 const server = fakeAttemptServer();
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  if (channel === 'documents:list' || channel === 'providers:list') return [];
  if (channel === 'review:exam:history') return options.history ? options.history() : { items: [historyRow], nextCursor: null };
  if (channel === 'review:artifact:get') return exam;
  return server.invoke(channel, request);
 });
 return server;
}

it('says exam history is unavailable instead of empty when loading it fails, and recovers on retry', async () => {
 let failing = true;
 bridge({ history: () => { if (failing) throw new Error('offline'); return { items: [], nextCursor: null }; } });
 render(<ExamsView />);
 fireEvent.click(screen.getByRole('button', { name: 'exams:history' }));
 const alert = await screen.findByRole('alert');
 expect(alert.textContent).toContain('exams:history_error');
 expect(screen.queryByText('exams:history_empty')).toBeNull();
 failing = false;
 fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 expect(await screen.findByText('exams:history_empty')).toBeTruthy();
 expect(screen.queryByText('exams:history_error')).toBeNull();
});

it('shows the empty message only when history loaded and is empty', async () => {
 bridge({ history: () => ({ items: [], nextCursor: null }) });
 render(<ExamsView />);
 fireEvent.click(screen.getByRole('button', { name: 'exams:history' }));
 expect(await screen.findByText('exams:history_empty')).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
});

it('does not show loading next to the error when the attempt fails to load', async () => {
 const server = fakeAttemptServer({ failures: { 'review:attempt:start': 1 } });
 invoke.mockImplementation(server.invoke);
 render(<TestPlayer artifact={exam} onRetake={vi.fn()} />);
 const alert = await screen.findByRole('alert');
 expect(alert.textContent).toContain('review:error');
 expect(screen.queryByText('review:loading')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 expect(await screen.findByRole('heading', { name: 'Question 1' })).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
});

it('goes back to setup, not history, after opening an exam from history', async () => {
 bridge();
 render(<ExamsView />);
 fireEvent.click(screen.getByRole('button', { name: 'exams:history' }));
 fireEvent.click(await screen.findByRole('button', { name: 'exams:reopen_named' }));
 await screen.findByRole('heading', { name: 'Question 1' });
 fireEvent.click(screen.getByRole('button', { name: 'exams:back' }));
 expect(await screen.findByText('exams:sources')).toBeTruthy();
 expect(screen.queryByRole('heading', { name: 'exams:history' })).toBeNull();
 expect(screen.getByRole('button', { name: 'exams:new_exam' }).getAttribute('aria-pressed')).toBe('true');
});

it('keeps an unsent draft across a History round trip', async () => {
 const server = bridge();
 render(<ExamsView />);
 fireEvent.click(screen.getByRole('button', { name: 'exams:history' }));
 fireEvent.click(await screen.findByRole('button', { name: 'exams:reopen_named' }));
 fireEvent.click(await screen.findByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button', { name: 'exams:back' }));
 await waitFor(() => expect(server.state.drafts.q1).toBe(1));
 fireEvent.click(screen.getByRole('button', { name: 'exams:history' }));
 fireEvent.click(await screen.findByRole('button', { name: 'exams:reopen_named' }));
 expect(((await screen.findByLabelText(/Beta/)) as HTMLInputElement).checked).toBe(true);
 expect(server.called('review:attempt:commit')).toHaveLength(0);
});
