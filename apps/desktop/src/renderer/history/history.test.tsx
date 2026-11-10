// @vitest-environment jsdom
import '../courses/test-platform';
/** User-visible search behavior, stale results, safe highlighting and undo actions. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistorySnippet } from './results';
import { HistorySearch } from './search';
import { HistoryFinder } from './index';
import { chatHitSchema } from '../../shared/chat-history';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate: vi.fn() }) }));
(globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { for (const root of roots.splice(0))
  await act(() => root.unmount()); vi.useRealTimers(); vi.resetAllMocks(); });
async function render(node: React.ReactNode) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); await act(() => root.render(node)); return host; }
const hit = chatHitSchema.parse({ id: '00000000-0000-4000-8000-000000000001', scope: 'general', documentId: null, courseId: null, courseTitle: null, courseColor: null, term: null, documentTitle: null, title: '資料', titleSnippet: '[mark]資料[/mark]', providerId: 'anthropic-api', modelId: 'fake', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', pinned: false, archived: false, hasAttachments: false, hasCitations: false, rank: 0, matches: [{ messageId: '00000000-0000-4000-8000-000000000002', role: 'user', snippet: '[mark]学習[/mark] 😀' }] });
it('opens the finder with Command K without intercepting selection or alternate shortcuts', async () => {
  invoke.mockImplementation(async channel => channel === 'chats:facets' ? { courses: [], documents: [], models: [] } : { items: [], nextCursor: null });
  await render(<HistoryFinder/>);
  for (const modifier of [{ shiftKey: true }, { altKey: true }]) {
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ...modifier })));
    expect(document.querySelector('.history-dialog')).toBeNull();
  }
  await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })));
  expect(document.querySelector('.history-dialog')).not.toBeNull();
});

it('closes with Escape and restores focus to the shortcut origin', async () => {
  invoke.mockImplementation(async channel => channel === 'chats:facets' ? { courses: [], documents: [], models: [] } : { items: [], nextCursor: null });
  await render(<HistoryFinder/>);
  const trigger = document.createElement('button');
  trigger.textContent = 'Find a conversation';
  document.body.append(trigger);
  trigger.focus();
  await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })));
  const input = document.querySelector<HTMLInputElement>('.history-dialog input')!;
  input.focus();
  await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(document.querySelector('.history-dialog')).toBeNull();
  await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
it('renders multilingual markers and hostile markup as text', async () => {
  const host = await render(<HistorySnippet text={'<img src=x onerror=alert(1)> [mark]繁體中文 学習 😀[/mark]'}/>);
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('mark')?.textContent).toBe('繁體中文 学習 😀');
});
it('shows results, opens a matching message and applies pinned filters', async () => {
  vi.useFakeTimers();
  invoke.mockImplementation(async (channel) => channel === 'chats:facets' ? { courses: [], documents: [], models: [] } : { items: [hit], nextCursor: null });
  const open = vi.fn(), host = await render(<HistorySearch onOpen={open}/>);
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(host.textContent).toContain('学習');
  const match = host.querySelector<HTMLButtonElement>('.history-match')!;
  await act(() => match.click());
  expect(open).toHaveBeenCalledWith(hit, hit.matches[0]!.messageId);
  const pinned = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Pinned')!;
  await act(() => pinned.click());
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(invoke).toHaveBeenLastCalledWith('chats:search', expect.objectContaining({ pinned: true }));
});
it('ignores a result that arrives after the filters changed', async () => {
  vi.useFakeTimers();
  let resolveOld: (value: unknown) => void = () => { };
  invoke.mockImplementation((channel) => channel === 'chats:facets' ? Promise.resolve({ courses: [], documents: [], models: [] }) : new Promise(resolve => { resolveOld = resolve; }));
  const host = await render(<HistorySearch onOpen={() => { }}/>);
  await act(() => vi.advanceTimersByTimeAsync(150));
  const old = resolveOld;
  const chip = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'General')!;
  await act(() => chip.click());
  await act(() => vi.advanceTimersByTimeAsync(150));
  await act(() => { old({ items: [hit], nextCursor: null }); });
  expect(host.querySelector('.history-result')).toBeNull();
  await act(() => { resolveOld({ items: [], nextCursor: null }); });
  expect(host.textContent).toContain('Your conversations will appear here');
});

it('keeps result nodes, focus and scroll during pagination and refresh without repeat search announcements',async()=>{
  vi.useFakeTimers();
  let settle!:(value:unknown)=>void;let searches=0;
  const cursor={rank:0,updatedAt:hit.updatedAt,id:hit.id};
  invoke.mockImplementation(channel=>channel==='chats:facets'?Promise.resolve({courses:[],documents:[],models:[]}):++searches===1?Promise.resolve({items:[hit],nextCursor:cursor}):new Promise(resolve=>{settle=resolve;}));
  const host=await render(<HistorySearch onOpen={()=>{}}/>);await act(()=>vi.advanceTimersByTimeAsync(150));
  const result=host.querySelector<HTMLButtonElement>('[data-history-result]')!,list=host.querySelector<HTMLElement>('.history-results')!;
  await act(()=>vi.advanceTimersByTimeAsync(1000));
  const announced=list.querySelector('[role=status]')?.textContent;
  expect(announced).toBe('1+ conversations');
  result.focus();list.scrollTop=150;
  const more=[...host.querySelectorAll('button')].find(b=>b.textContent==='Load more')!;
  await act(()=>more.click());
  expect(host.querySelector('[data-history-result]')).toBe(result);expect(document.activeElement).toBe(result);expect(list.scrollTop).toBe(150);
  expect(list.querySelector('[role=status]')?.textContent).toBe(announced);
  const added = { ...hit, id: '00000000-0000-4000-8000-000000000003' as typeof hit.id, titleSnippet: 'Second conversation' };
  await act(()=>settle({items:[added],nextCursor:null}));
  expect(host.querySelectorAll('[data-history-result]')).toHaveLength(2);
  expect(host.querySelector('[data-history-result]')).toBe(result);
  expect(document.activeElement).toBe(result);
  expect(list.scrollTop).toBe(150);
  await act(()=>window.dispatchEvent(new Event('vstudy:history-changed')));
  await act(()=>vi.advanceTimersByTimeAsync(150));
  expect(host.querySelector('[data-history-result]')).toBe(result);expect(document.activeElement).toBe(result);
  await act(()=>vi.advanceTimersByTimeAsync(1000));
  expect(list.querySelector('[role=status]')?.textContent).toBe(announced);
  await act(()=>settle({items:[hit,added],nextCursor:null}));
  expect(host.querySelector('[data-history-result]')).toBe(result);
});


it.each([false, true])('replaces existing results safely when a filter returns an empty set = %s', async empty => {
  vi.useFakeTimers();
  const replacement = { ...hit, id: '00000000-0000-4000-8000-000000000004' as typeof hit.id, titleSnippet: 'Replacement conversation' };
  invoke.mockImplementation(async (channel, request) => channel === 'chats:facets'
    ? { courses: [], documents: [], models: [] }
    : { items: request.pinned ? empty ? [] : [replacement] : [hit], nextCursor: null });
  const open = vi.fn(), host = await render(<HistorySearch onOpen={open}/>);
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(host.querySelectorAll('[data-history-result]')).toHaveLength(1);
  const pinned = [...host.querySelectorAll('button')].find(b => b.textContent === 'Pinned')!;
  await act(() => pinned.click());
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(host.querySelectorAll('[data-history-result]')).toHaveLength(empty ? 0 : 1);
  if (empty) expect(host.textContent).toContain('Your conversations will appear here');
  else {
    expect(host.textContent).toContain('Replacement conversation');
    await act(() => host.querySelector<HTMLButtonElement>('[data-history-result]')!.click());
    expect(open).toHaveBeenCalledWith(replacement, replacement.matches[0]!.messageId);
  }
});

it('ignores usage updates and refreshes when history changes or the window regains focus', async () => {
  vi.useFakeTimers();
  invoke.mockImplementation(async channel => channel === 'chats:facets' ? { courses: [], documents: [], models: [] } : { items: [], nextCursor: null });
  await render(<HistorySearch onOpen={() => { }}/>);
  await act(() => vi.advanceTimersByTimeAsync(150));
  invoke.mockClear();
  await act(() => window.dispatchEvent(new Event('usage-updated')));
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(invoke).not.toHaveBeenCalled();
  for (const event of ['vstudy:history-changed', 'focus']) {
    await act(() => window.dispatchEvent(new Event(event)));
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(invoke).toHaveBeenCalledWith('chats:search', expect.anything());
    invoke.mockClear();
  }
});

it('refreshes completed background content within one second and bounds event bursts', async () => {
 vi.useFakeTimers(); let completed=false;
 invoke.mockImplementation(async channel=>channel==='chats:facets'?{courses:[],documents:[],models:[]}:{items:completed?[hit]:[],nextCursor:null});
 const host=await render(<HistorySearch onOpen={()=>{}}/>);
 await act(()=>vi.advanceTimersByTimeAsync(150)); invoke.mockClear(); completed=true;
 for(let i=0;i<10;i++) {
  await act(()=>window.dispatchEvent(new Event('vstudy:history-changed')));
  await act(()=>vi.advanceTimersByTimeAsync(50));
 }
 await act(()=>vi.advanceTimersByTimeAsync(450));
 process.stdout.write(`FRESHNESS elapsedMs=950 visibleResults=${host.querySelectorAll('[data-history-result]').length} searches=${invoke.mock.calls.filter(c=>c[0]==='chats:search').length}\n`);
 expect(host.querySelectorAll('[data-history-result]')).toHaveLength(1);
 expect(invoke.mock.calls.filter(c=>c[0]==='chats:search').length).toBeLessThanOrEqual(2);
});
