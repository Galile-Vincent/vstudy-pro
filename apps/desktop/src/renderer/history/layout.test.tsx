// @vitest-environment jsdom
/** History page structure: one main, one h1, labelled filters, flat rows without nested controls. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryView } from './index';
import { chatHitSchema, type ChatHit } from '../../shared/chat-history';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ route: {}, navigate: vi.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = (n: number, matches: unknown[] = []): ChatHit => chatHitSchema.parse({
  id: `00000000-0000-4000-8000-00000000000${n}`, scope: 'general', documentId: null, courseId: null,
  courseTitle: null, courseColor: null, term: null, documentTitle: null, title: `Chat ${n}`,
  titleSnippet: `Chat ${n}`, providerId: 'anthropic-api', modelId: 'fake', createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z', pinned: false, archived: false, hasAttachments: false,
  hasCitations: false, rank: 0, matches,
});
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.resetAllMocks(); });
async function mount(items: ChatHit[], nextCursor: unknown = null) {
  vi.useFakeTimers();
  invoke.mockImplementation(async channel => channel === 'chats:facets'
    ? { courses: [], documents: [], models: [] }
    : channel === 'providers:list' ? [] : { items, nextCursor });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<HistoryView/>); });
  await act(() => vi.advanceTimersByTimeAsync(150));
}

it('renders one main landmark and one h1 with the result count', async () => {
  await mount([make(1), make(2)]);
  expect(host.querySelectorAll('main')).toHaveLength(1);
  expect(host.querySelectorAll('h1')).toHaveLength(1);
  expect(host.querySelector('h1')?.textContent).toBe('History');
  expect(host.querySelector('[data-slot=page-header]')?.textContent).toContain('2 conversations');
});
it('marks a partial page with a plus sign', async () => {
  await mount([make(1)], { rank: 0, updatedAt: make(1).updatedAt, id: make(1).id });
  expect(host.querySelector('[data-slot=page-header]')?.textContent).toContain('1+ conversations');
});
it('shows the empty state as a level-two heading and no count', async () => {
  await mount([]);
  expect(host.querySelector('[data-slot=empty-state] h2')?.textContent).toBe('Your conversations will appear here');
  expect(host.querySelector('[data-slot=page-header]')?.textContent).not.toContain('conversations');
  expect(host.querySelectorAll('h1')).toHaveLength(1);
});
it('labels every filter control through its field', async () => {
  await mount([make(1)]);
  const fields = [...host.querySelectorAll('[data-slot=form-field]')];
  expect(fields.map(f => f.querySelector('label')?.textContent)).toEqual(['Course', 'Term', 'Document', 'Message type', 'Model', 'From', 'Through']);
  for (const field of fields) {
    const label = field.querySelector('label')!, control = field.querySelector('select,input')!;
    expect(label.htmlFor).toBe(control.id);
    expect(control.id).not.toBe('');
  }
  expect(host.querySelector('[role=group][aria-label="History filters"]')).not.toBeNull();
});
it('keeps one control per action in each row and no nested controls', async () => {
  await mount([make(1, [{ messageId: '00000000-0000-4000-8000-0000000000aa', role: 'user', snippet: 'a [mark]hit[/mark]' }]), make(2)]);
  const rows = [...host.querySelectorAll('[data-testid=history-result]')];
  expect(rows).toHaveLength(2);
  expect(rows[0]!.querySelectorAll('.history-match')).toHaveLength(1);
  expect(rows[1]!.querySelectorAll('.history-match')).toHaveLength(0);
  for (const row of rows) {
    expect(row.querySelectorAll('[data-history-result]')).toHaveLength(1);
    expect(row.querySelector('button button, a button, button a, [role=button] button')).toBeNull();
    expect(row.querySelector('.history-result-title')?.querySelector('time')?.textContent).toBeTruthy();
  }
});
