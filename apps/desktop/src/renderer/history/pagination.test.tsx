// @vitest-environment jsdom
/** Deleting inside an accumulated, paginated list keeps neighbour focus and the loaded pages. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistorySearch } from './search';
import { chatHitSchema, type ChatHit } from '../../shared/chat-history';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const make = (n: number): ChatHit => chatHitSchema.parse({
  id: id(n), scope: 'general', documentId: null, courseId: null,
  courseTitle: null, courseColor: null, term: null, documentTitle: null, title: `Chat ${n}`,
  titleSnippet: `Chat ${n}`, providerId: 'anthropic-api', modelId: 'fake', createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z', pinned: false, archived: false, hasAttachments: false,
  hasCitations: false, rank: 0, matches: [],
});
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.resetAllMocks();
});
async function setup(total: number, loadAll = true) {
  vi.useFakeTimers();
  let items = Array.from({ length: total }, (_, i) => make(i + 1));
  const summary = vi.fn();
  invoke.mockImplementation(async (channel, payload) => {
    if (channel === 'chats:facets') return { courses: [], documents: [], models: [] };
    if (channel === 'chats:update') {
      if (payload.patch.deleted) items = items.filter(h => h.id !== payload.conversationId);
      else if (payload.patch.deleted === false) items = Array.from({ length: total }, (_, i) => make(i + 1));
      return { ok: true };
    }
    const start = payload.cursor ? items.findIndex(h => h.id === payload.cursor.id) + 1 : 0;
    const slice = items.slice(start, start + payload.limit);
    const last = slice.at(-1);
    return { items: slice, nextCursor: last && start + slice.length < items.length ? { rank: 0, updatedAt: last.updatedAt, id: last.id } : null };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(() => root.render(<HistorySearch onOpen={() => {}} onSummary={summary} />));
  await act(() => vi.advanceTimersByTimeAsync(150));
  if (loadAll) {
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Load more')!.click(); });
    await act(() => vi.advanceTimersByTimeAsync(150));
  }
  return { host, summary };
}
const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-history-result]')];
const has = (host: HTMLElement, n: number) => rows(host).some(r => r.dataset.historyId === id(n));
async function deleteRow(host: HTMLElement, n: number) {
  const row = rows(host).find(r => r.dataset.historyId === id(n))!.closest<HTMLElement>('[data-testid=history-result]')!;
  const trigger = row.querySelector<HTMLButtonElement>('button[aria-haspopup=menu]')!;
  trigger.focus();
  await act(async () => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  const item = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(i => i.textContent === 'Delete')!;
  await act(async () => { item.click(); });
}
const focusedId = () => (document.activeElement as HTMLElement | null)?.dataset?.historyId;

it('loads both pages before the tests delete anything', async () => {
  const { host } = await setup(60);
  expect(rows(host)).toHaveLength(60);
});
it('focuses the next neighbour when deleting a row from the second page', async () => {
  const { host, summary } = await setup(60);
  await deleteRow(host, 45);
  expect(has(host, 45)).toBe(false);
  expect(rows(host)).toHaveLength(59);
  expect(focusedId()).toBe(id(46));
  expect(summary).toHaveBeenLastCalledWith({ count: 59, more: false });
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(rows(host)).toHaveLength(59);
  expect(focusedId()).toBe(id(46));
});
it('focuses the previous neighbour when deleting the last loaded row', async () => {
  const { host } = await setup(60);
  await deleteRow(host, 60);
  expect(rows(host)).toHaveLength(59);
  expect(focusedId()).toBe(id(59));
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(focusedId()).toBe(id(59));
});
it('keeps pagination when deleting the last row of an unfinished first page', async () => {
  const { host } = await setup(60, false);
  await deleteRow(host, 30);
  expect(focusedId()).toBe(id(29));
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(rows(host)).toHaveLength(30);
  expect(has(host, 31)).toBe(true);
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'Load more')).toBe(true);
});
it('keeps every loaded page after the reconciling refresh', async () => {
  const { host } = await setup(60);
  await deleteRow(host, 10);
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(rows(host)).toHaveLength(59);
  expect(has(host, 60)).toBe(true);
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'Load more')).toBe(false);
});
it('restores the row in its place on Undo', async () => {
  const { host } = await setup(60);
  await deleteRow(host, 45);
  await act(async () => { host.querySelector<HTMLButtonElement>('.history-undo button')!.click(); });
  const ids = rows(host).map(r => r.dataset.historyId);
  expect(ids).toHaveLength(60);
  expect(ids.indexOf(id(45))).toBe(44);
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(rows(host).map(r => r.dataset.historyId)).toEqual(ids);
});
