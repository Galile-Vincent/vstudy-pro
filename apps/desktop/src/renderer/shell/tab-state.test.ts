import { describe, it, expect } from 'vitest';
import { activeTab, currentRoute, createTab, initialTabs, tabReducer, loadTabs, saveTabs } from './tab-state';
import { TAB_STORAGE_KEY } from '../../shared/app-tabs';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const home = () => initialTabs(id(1));
describe('app tabs', () => {
  it('keeps independent histories and switches without adding visits', () => {
    let state = tabReducer(home(), { type: 'replace-route', id: id(1), route: { view: 'library' } });
    state = tabReducer(state, { type: 'open', tab: createTab(id(2), { view: 'courses' }, 1) });
    state = tabReducer(state, { type: 'activate', id: id(1), now: 2 });
    expect(currentRoute(state).view).toBe('library');
    state = tabReducer(state, { type: 'history', id: id(1), direction: 'back' });
    expect(currentRoute(state).view).toBe('home');
    expect(state.tabs[1]!.history.entries).toHaveLength(1);
  });
  it('selects the right neighbor, then the left, then a fresh home', () => {
    let state = home();
    for (const n of [2, 3]) state = tabReducer(state, { type: 'open', tab: createTab(id(n), { view: 'library' }, n) });
    const close = (n: number) => { state = tabReducer(state, { type: 'close', id: id(n), fallback: createTab(id(4), { view: 'home' }, 4) }); };
    state = tabReducer(state, { type: 'activate', id: id(2), now: 4 });
    close(2); expect(state.activeId).toBe(id(3));
    close(3); expect(state.activeId).toBe(id(1));
    close(1); expect(currentRoute(state).view).toBe('home');
  });
  it('bounds tabs and rejects invalid reorder requests', () => {
    let state = home();
    for (let n = 2; n <= 31; n++) state = tabReducer(state, { type: 'open', tab: createTab(id(n), { view: 'home' }, n) });
    expect(state.tabs).toHaveLength(30);
    expect(tabReducer(state, { type: 'reorder', ids: [id(1)] })).toBe(state);
    const ids = state.tabs.map(tab => tab.id).reverse();
    expect(tabReducer(state, { type: 'reorder', ids }).tabs[0]!.id).toBe(ids[0]);
  });
  it('migrates once, restores presentation and falls back on corruption', () => {
    const data = new Map<string, string>([['vstudy-route', JSON.stringify({ view: 'library', aiParse: true })]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    let state = loadTabs(storage, id(1));
    expect(currentRoute(state).view).toBe('library'); expect(data.has('vstudy-route')).toBe(false);
    state = tabReducer(state, { type: 'presentation', id: id(1), presentation: { kind: 'app', scrollTop: 450 } });
    expect(saveTabs(storage, state)).toBe(true);
    expect(activeTab(loadTabs(storage, id(2))).presentation.scrollTop).toBe(450);
    data.set(TAB_STORAGE_KEY, '{}');
    expect(currentRoute(loadTabs(storage, id(2))).view).toBe('home');
    expect(saveTabs({ ...storage, setItem: () => { throw new Error('unavailable'); } }, state)).toBe(false);
  });
});
