// @vitest-environment jsdom
/** One polite live region announces each completed search, including zero and errors. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistorySearch } from './search';
import { i18n } from '../../shared/i18n';
import { chatHitSchema, type ChatHit } from '../../shared/chat-history';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = (n: number): ChatHit => chatHitSchema.parse({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, scope: 'general', documentId: null,
  courseId: null, courseTitle: null, courseColor: null, term: null, documentTitle: null,
  title: `Chat ${n}`, titleSnippet: `Chat ${n}`, providerId: 'anthropic-api', modelId: 'fake',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', pinned: false,
  archived: false, hasAttachments: false, hasCitations: false, rank: 0, matches: [],
});
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
});
type Reply = { items: ChatHit[]; nextCursor: null | { rank: number; updatedAt: string; id: ChatHit['id'] } };
async function setup(reply: (query: string) => Reply | Promise<Reply>) {
  vi.useFakeTimers();
  invoke.mockImplementation(async (channel, payload) => channel === 'chats:facets'
    ? { courses: [], documents: [], models: [] }
    : reply(payload.query ?? ''));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(() => root.render(<HistorySearch onOpen={() => {}}/>));
  return host;
}
const live = (host: HTMLElement) => host.querySelector<HTMLElement>('.history-results [role=status]');
const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));
async function type(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it.each([
  ['en', '2 conversations', 'No conversations found'],
  ['zh-Hant', '2 個對話', '找不到對話'],
  ['ja', '2 件の会話', '会話が見つかりません'],
])('announces the count and zero results in %s', async (language, two, none) => {
  await i18n.changeLanguage(language);
  const host = await setup(query => ({ items: query === 'none' ? [] : [make(1), make(2)], nextCursor: null }));
  expect(live(host)).not.toBeNull();
  await settle();
  expect(live(host)!.textContent).toBe(two);
  await type(host, 'none');
  await settle();
  expect(live(host)!.textContent).toBe(none);
  expect(host.querySelectorAll('[role=status]:not(.history-undo):not(.astryx-button *)')).toHaveLength(1);
});
it('announces a partial page with a plus sign and one conversation without plural', async () => {
  const cursor = { rank: 0, updatedAt: make(1).updatedAt, id: make(1).id };
  const host = await setup(query => query === 'one'
    ? { items: [make(1)], nextCursor: null }
    : { items: [make(1), make(2)], nextCursor: cursor });
  await settle();
  expect(live(host)!.textContent).toBe('2+ conversations');
  await type(host, 'one');
  await settle();
  expect(live(host)!.textContent).toBe('1 conversation');
});
it('announces once after typing settles instead of on every keystroke', async () => {
  const host = await setup(query => ({ items: query.length > 2 ? [make(1)] : [make(1), make(2)], nextCursor: null }));
  await settle();
  const seen: string[] = [];
  const observer = new MutationObserver(() => seen.push(live(host)!.textContent ?? ''));
  observer.observe(live(host)!, { childList: true, characterData: true, subtree: true });
  for (const value of ['a', 'ab', 'abc']) {
    await type(host, value);
    await act(() => vi.advanceTimersByTimeAsync(200));
  }
  await settle();
  observer.disconnect();
  expect(seen.filter(Boolean)).toEqual(['1 conversation']);
});
it('announces an error and then the count after a successful retry', async () => {
  let fail = true;
  const host = await setup(() => {
    if (fail) throw new Error('offline');
    return { items: [make(1)], nextCursor: null };
  });
  await settle();
  expect(live(host)!.textContent).toBe('Could not load history.');
  fail = false;
  await act(async () => { host.querySelector<HTMLButtonElement>('[role=alert] button')!.click(); });
  await settle();
  expect(live(host)!.textContent).toBe('1 conversation');
});
it('stays quiet when a refresh changes the count without a filter change', async () => {
  let rows = [make(1)];
  const host = await setup(() => ({ items: rows, nextCursor: null }));
  await settle();
  expect(live(host)!.textContent).toBe('1 conversation');
  rows = [make(1), make(2)];
  await act(() => window.dispatchEvent(new Event('vstudy:history-changed')));
  await settle();
  expect(host.querySelectorAll('[data-history-result]')).toHaveLength(2);
  expect(live(host)!.textContent).toBe('1 conversation');
});
it('replaces a stale error announcement once a refresh succeeds', async () => {
  let fail = false;
  const host = await setup(() => {
    if (fail) throw new Error('offline');
    return { items: [make(1)], nextCursor: null };
  });
  await settle();
  fail = true;
  await act(() => window.dispatchEvent(new Event('vstudy:history-changed')));
  await settle();
  expect(live(host)!.textContent).toBe('Could not load history.');
  fail = false;
  await act(async () => { host.querySelector<HTMLButtonElement>('[role=alert] button')!.click(); });
  await settle();
  expect(live(host)!.textContent).toBe('1 conversation');
});
