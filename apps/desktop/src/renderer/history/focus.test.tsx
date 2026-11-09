// @vitest-environment jsdom
/** Deleting a result keeps keyboard focus inside History. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistorySearch } from './search';
import { chatHitSchema, type ChatHit } from '../../shared/chat-history';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = (n: number): ChatHit => chatHitSchema.parse({
  id: `00000000-0000-4000-8000-00000000000${n}`, scope: 'general', documentId: null, courseId: null,
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
const held: (() => void)[] = [];
let hold = false;
async function setup(count: number, fallback?: () => void) {
  vi.useFakeTimers();
  hold = false;
  held.length = 0;
  let items = Array.from({ length: count }, (_, i) => make(i + 1));
  invoke.mockImplementation(async (channel, payload) => {
    if (channel === 'chats:facets') return { courses: [], documents: [], models: [] };
    if (channel === 'chats:update') {
      if (payload.patch.deleted) items = items.filter(h => h.id !== payload.conversationId);
      return { ok: true };
    }
    const result = { items: [...items], nextCursor: null };
    if (!hold) return result;
    return new Promise(resolve => { held.push(() => resolve(result)); });
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(() => root.render(<HistorySearch onOpen={() => {}} {...(fallback ? { onFocusFallback: fallback } : {})}/>));
  await act(() => vi.advanceTimersByTimeAsync(150));
  return host;
}
async function deleteRow(host: HTMLElement, index: number) {
  const row = host.querySelectorAll<HTMLElement>('[data-testid=history-result]')[index]!;
  const trigger = row.querySelector<HTMLButtonElement>('button[aria-haspopup=menu]')!;
  trigger.focus();
  await act(async () => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  const item = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(i => i.textContent === 'Delete')!;
  await act(async () => { item.click(); });
  await act(() => vi.advanceTimersByTimeAsync(800));
}
const focusedTitle = () => document.activeElement?.matches('[data-history-result]') ? document.activeElement.textContent : document.activeElement?.tagName;

it('moves focus to the next result after deleting a middle row', async () => {
  const host = await setup(3);
  await deleteRow(host, 1);
  expect(host.querySelector('[role=status] button')).not.toBeNull();
  expect(focusedTitle()).toContain('Chat 3');
});
it('moves focus to the previous result after deleting the last row', async () => {
  const host = await setup(3);
  await deleteRow(host, 2);
  expect(focusedTitle()).toContain('Chat 2');
});
it('moves focus to Undo after deleting the only row', async () => {
  const host = await setup(1);
  await deleteRow(host, 0);
  expect(document.activeElement).toBe(host.querySelector('[role=status] button'));
});
it('moves focus to the page heading when Undo disappears with focus', async () => {
  const fallback = vi.fn();
  const host = await setup(1, fallback);
  await deleteRow(host, 0);
  await act(async () => { host.querySelector<HTMLButtonElement>('[role=status] button')!.click(); });
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(fallback).toHaveBeenCalled();
});

const type = async (host: HTMLElement, value: string) => {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
  input.focus();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
};
const release = async () => {
  await act(async () => { held.splice(0).forEach(resolve => resolve()); });
  await act(() => vi.advanceTimersByTimeAsync(800));
};

it('keeps focus in the search input when a delayed deletion refresh arrives while typing', async () => {
  const host = await setup(3);
  hold = true;
  await deleteRow(host, 1);
  const input = await type(host, 'chat');
  await act(() => vi.advanceTimersByTimeAsync(200));
  await release();
  expect(document.activeElement).toBe(input);
});
it('keeps focus on a control the user moved to before the delayed refresh arrives', async () => {
  const host = await setup(3);
  hold = true;
  await deleteRow(host, 1);
  const chip = [...host.querySelectorAll('button')].find(b => b.textContent === 'General')!;
  chip.focus();
  await release();
  expect(document.activeElement).toBe(chip);
});
it('does not pull focus back into the list when the deletion refresh lands after Undo', async () => {
  const fallback = vi.fn(() => (document.activeElement as HTMLElement | null)?.blur());
  const host = await setup(3, fallback);
  hold = true;
  await deleteRow(host, 1);
  const undo = host.querySelector<HTMLButtonElement>('[role=status] button')!;
  undo.focus();
  await act(async () => { undo.click(); });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(fallback).toHaveBeenCalled();
  await release();
  expect(document.activeElement?.matches('[data-history-result]')).toBe(false);
});
it('hands focus to the newest delete only', async () => {
  const host = await setup(4);
  hold = true;
  await deleteRow(host, 0);
  await deleteRow(host, 2);
  await release();
  expect(focusedTitle()).toContain('Chat 4');
});
