// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ExamHistory } from './history';
import { ExamPlayer } from './player';
import { fakeArtifact, fakeAttemptServer } from '../review/fake-attempt-server';
const language = vi.hoisted(() => ({ current: 'en' }));
vi.mock('../bridge', () => ({ desktop: { invoke: vi.fn() } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: language.current } }) }));
afterEach(() => { cleanup(); language.current = 'en'; });

const created = '2026-11-08T13:05:00.000Z';
const languages = ['en', 'zh-Hant', 'ja'] as const;
const row = {
 artifact: { ...fakeArtifact(true), createdAt: created, test: undefined },
 attempt: { id: 'a', phase: 'graded', startedAt: created, committedAt: created, results: [{ itemId: 'q1', correct: true, type: 'mcq' }, { itemId: 'q2', correct: false, type: 'mcq' }, { itemId: 'q3', correct: true, type: 'mcq' }] },
} as never;

it.each(languages)('formats history dates and percentages with the app language (%s)', (lang) => {
 language.current = lang;
 render(<ExamHistory items={[row]} busy={false} documentTitle={id => id} onOpen={vi.fn()} onDelete={vi.fn()} />);
 const expectedDate = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(created));
 expect(screen.getByText((_, element) => element?.tagName === 'TIME' && element.textContent === expectedDate)).toBeTruthy();
 const percent = new Intl.NumberFormat(lang, { style: 'percent' }).format(2 / 3);
 expect(screen.getByText(percent, { selector: 'strong' })).toBeTruthy();
});

it('uses a different date format for each app language', () => {
 const texts = languages.map((lang) => {
  language.current = lang;
  const view = render(<ExamHistory items={[row]} busy={false} documentTitle={id => id} onOpen={vi.fn()} onDelete={vi.fn()} />);
  const text = view.container.querySelector('time')!.textContent;
  view.unmount();
  return text;
 });
 expect(new Set(texts).size).toBe(3);
});

it.each(languages)('formats the results percentages with the app language (%s)', (lang) => {
 language.current = lang;
 const server = fakeAttemptServer();
 for (const id of ['q1', 'q2', 'q3']) server.state.graded[id] = id !== 'q2';
 const attempt = server.view() as never;
 render(<ExamPlayer artifact={fakeArtifact(true)} attempt={attempt} index={0} draft={null} results busy={false} failed={false} draftError={false}
  explanations={{}} gradedEarlier={false} onDraft={vi.fn()} onMove={vi.fn()} onSubmit={vi.fn()} onResults={vi.fn()} onExplain={vi.fn()} onRetry={vi.fn()} onReport={vi.fn()} />);
 const percent = new Intl.NumberFormat(lang, { style: 'percent' }).format(2 / 3);
 expect(document.querySelector('.exam-score-value strong')!.textContent).toBe(percent);
 expect(document.querySelector('.exam-accuracy-row')!.textContent).toContain(new Intl.NumberFormat(lang, { style: 'percent' }).format(2 / 3));
});
