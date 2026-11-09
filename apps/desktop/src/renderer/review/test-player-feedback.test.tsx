// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { IpcResponse } from '../../shared/ipc';
import { studyTestSchema } from '../../shared/review-artifacts';
import { i18n } from '../../shared/i18n';
import en from '../../shared/locales/en/review.json';
import ja from '../../shared/locales/ja/review.json';
import zhHant from '../../shared/locales/zh-Hant/review.json';
import { resetDraftQueues } from './draft-queue';
import { TestPlayer } from './test-player';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.resetAllMocks(); resetDraftQueues(); });
const source = { documentId: '10000000-0000-4000-8000-000000000001', version: 'original' as const, excerptHash: 'a'.repeat(64), quote: 'Source passage' };
const test = studyTestSchema.parse({ version: 1, items: [
 { id: 'a', conceptKey: 'chain-rule', type: 'mcq', stem: 'First question', options: ['A', 'B'], answer: 1, explanation: 'First explanation', source },
 { id: 'b', conceptKey: 'product-rule', type: 'true_false', stem: 'Second question', answer: true, explanation: 'Second explanation', source },
 { id: 'c', conceptKey: 'osmosis', type: 'true_false', stem: 'Third question', answer: true, explanation: 'Third explanation', source },
] });
const artifact = { id: 'artifact', courseId: '00000000-0000-4000-8000-000000000001', title: 'Practice', test } as unknown as NonNullable<IpcResponse<'review:artifact:get'>>;
const answered = (...ids: string[]) => ({ id: 'attempt', artifactId: 'artifact', phase: 'graded', answers: {}, startedAt: '', committedAt: null, confirmedAt: null,
 results: test.items.map((item, index) => ({ itemId: item.id, conceptKey: item.conceptKey, correct: ids.includes(item.id) ? index === 2 : null, reportedBad: false, ...(ids.includes(item.id) ? { feedback: item } : {}) })) });
const concept = (key: string, label: string) => ({ id: `00000000-0000-4000-8000-0000000000${key.length}`, courseId: artifact.courseId, key, label, source: 'heading', unitId: null, userState: 'none', note: null, createdAt: '2026-11-06T00:00:00.000Z' });
function respond(initial: ReturnType<typeof answered>, afterCommit = initial) {
 let current = initial;
 invoke.mockImplementation(async (channel: string) => {
  if (channel === 'review:concepts:list') return { items: [concept('chain-rule', 'The chain rule'), concept('osmosis', 'Osmosis')], nextCursor: null };
  if (channel === 'review:attempt:start') return { id: 'attempt' };
  if (channel === 'review:attempt:commit') current = afterCommit;
  return current;
 });
}
it('moves focus to a polite feedback region after a submitted answer so keyboard and screen reader users hear it', async () => {
 respond(answered(), answered('a'));
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByLabelText('B'));
 fireEvent.click(screen.getByRole('button', { name: en.answer_next }));
 const feedback = await screen.findByRole('status', { name: en.item_feedback });
 expect(within(feedback).getByText('First explanation')).toBeTruthy();
 expect(feedback.getAttribute('aria-live')).toBe('polite');
 await waitFor(() => expect(document.activeElement).toBe(feedback));
});
it('lists only concepts with misses, by label, with a correct plural count', async () => {
 const attempt = answered('a', 'b', 'c');
 attempt.results[0]!.correct = false; attempt.results[1]!.correct = false; attempt.results[2]!.correct = true; attempt.phase = 'confirmed';
 respond(attempt);
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByRole('button', { name: en.view_results }));
 const items = await screen.findAllByRole('listitem');
 expect(items.map(item => item.textContent)).toEqual(['The chain rule: 1 question worth another look', 'product-rule: 1 question worth another look']);
 expect(screen.queryByText(/osmosis/i)).toBeNull();
 expect(screen.queryByText('Osmosis')).toBeNull();
});
it.each([['ja', ja], ['zh-Hant', zhHant]] as const)('prints missed-concept counts in %s without leaking English', async (language, catalog) => {
 await i18n.changeLanguage(language);
 const attempt = answered('a', 'b', 'c');
 attempt.results[0]!.correct = false; attempt.results[2]!.correct = true; attempt.results[1]!.correct = true; attempt.phase = 'confirmed';
 respond(attempt);
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 fireEvent.click(await screen.findByRole('button', { name: catalog.view_results }));
 const item = (await screen.findAllByRole('listitem'))[0]!;
 expect(item.textContent).toBe(catalog.concept_missed_other.replace('{{label}}', 'The chain rule').replace('{{count}}', '1'));
 expect(item.textContent).not.toMatch(/questions? worth/);
});
