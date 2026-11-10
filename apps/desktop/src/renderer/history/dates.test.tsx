// @vitest-environment jsdom
import '../courses/test-platform';
/** Result dates follow the app language, not the browser locale. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryResults } from './results';
import { i18n } from '../../shared/i18n';
import { chatHitSchema } from '../../shared/chat-history';

vi.mock('../bridge', () => ({ desktop: { invoke: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hit = chatHitSchema.parse({
  id: '00000000-0000-4000-8000-000000000001', scope: 'general', documentId: null, courseId: null,
  courseTitle: null, courseColor: null, term: null, documentTitle: null, title: 'Chat',
  titleSnippet: 'Chat', providerId: 'anthropic-api', modelId: 'fake', createdAt: '2026-11-06T12:00:00Z',
  updatedAt: '2026-11-06T12:00:00Z', pinned: false, archived: false, hasAttachments: false,
  hasCitations: false, rank: 0, matches: [],
});
afterEach(async () => { await i18n.changeLanguage('en'); });

it.each([['en', 'Nov 6'], ['zh-Hant', '11月6日'], ['ja', '11月6日']])('formats the date for %s', async (language, expected) => {
  await i18n.changeLanguage(language);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(() => root.render(<HistoryResults items={[hit]} onOpen={() => {}} onUpdate={() => {}} onRename={() => {}}/>));
  expect(host.querySelector('time')?.textContent).toBe(expected);
  await act(() => root.unmount());
  host.remove();
});

it('updates the date when the language changes while mounted', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(() => root.render(<HistoryResults items={[hit]} onOpen={() => {}} onUpdate={() => {}} onRename={() => {}}/>));
  expect(host.querySelector('time')?.textContent).toBe('Nov 6');
  await act(() => i18n.changeLanguage('ja'));
  expect(host.querySelector('time')?.textContent).toBe('11月6日');
  await act(() => root.unmount());
  host.remove();
});
