// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExamsView } from './index';
import { fakeArtifact, fakeAttemptServer } from '../review/fake-attempt-server';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

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
