// @vitest-environment jsdom
/** Each protected view contains render failures and can remount its content after a retry. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryView } from '../history';
import { HistorySearch } from '../history/search';
import { Planner } from '../courses/planner';
import { emptyPlanner } from '../../shared/planner';
import { i18n, tr } from '../../shared/i18n';

const failure = vi.hoisted(() => ({ active: true }));
vi.mock('../history/results', () => ({ HistoryResults: () => {
  if (failure.active) throw new Error('History render failed');
  return <p>History recovered</p>;
} }));
vi.mock('../shell', () => ({ useNavigate: () => {
  if (failure.active) throw new Error('History view render failed');
  return { route: {}, navigate: vi.fn() };
} }));
vi.mock('../bridge', () => ({ desktop: { invoke: async (channel: string) => {
  if (channel === 'providers:list') return [];
  if (channel === 'chats:facets') return { courses: [], documents: [], models: [] };
  if (channel === 'planner:snapshot') return emptyPlanner();
  return { items: [], nextCursor: null };
} } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const hosts: HTMLElement[] = [], roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
  await i18n.changeLanguage('en');
});
it.each(['en', 'zh-Hant', 'ja'])('contains render failures and retries each protected view in %s', async language => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await i18n.changeLanguage(language);
  const clock = () => {
    if (failure.active) throw new Error('Planner render failed');
    return Date.parse('2026-11-01T12:00:00Z');
  };
  for (const view of [<HistoryView/>, <HistorySearch onOpen={() => {}}/>, <Planner courses={[]} deadlines={[]} clock={clock}/>]) {
    failure.active = true;
    const host = document.createElement('div');
    hosts.push(host); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    await act(() => root.render(<><nav>Navigation survives</nav>{view}</>));
    expect(host.querySelector('nav')?.textContent).toBe('Navigation survives');
    expect(host.querySelector('[role=alert]')?.textContent).toContain(tr('common:surface_render_error'));
    expect(tr('common:surface_render_error')).not.toBe('surface_render_error');
    const retry = host.querySelector<HTMLButtonElement>('[role=alert] button')!;
    expect(retry.textContent).toBe(tr('common:retry'));
    failure.active = false;
    await act(() => retry.click());
    expect(host.querySelector('[role=alert]')).toBeNull();
    expect(host.querySelector('.history-page, .history-search, .planner')).not.toBeNull();
  }
});
