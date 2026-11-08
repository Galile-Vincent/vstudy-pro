import { it, expect } from 'vitest';
import { tabSetSchema } from './app-tabs';
import { initialTabs } from '../renderer/shell/tab-state';
const state = initialTabs('00000000-0000-4000-8000-000000000001');
it('validates a strict bounded tab set and history', () => {
  expect(tabSetSchema.safeParse(state).success).toBe(true);
  for (const invalid of [{ ...state, token: 'secret' }, { ...state, activeId: crypto.randomUUID() }, { ...state, tabs: [] }, { ...state, tabs: [...state.tabs, ...state.tabs] }, { ...state, tabs: [{ ...state.tabs[0], history: { entries: [{ view: 'home' }], index: 2 } }] }, { ...state, tabs: [{ ...state.tabs[0], presentation: { kind: 'app', scrollTop: -1 } }] }]) expect(tabSetSchema.safeParse(invalid).success).toBe(false);
});
it('rejects more than 30 distinct tabs and unknown presentation fields', () => {
  expect(tabSetSchema.safeParse({ ...state, tabs: Array.from({ length: 31 }, (_, index) => ({ ...state.tabs[0], id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })) }).success).toBe(false);
  expect(tabSetSchema.safeParse({ ...state, tabs: [{ ...state.tabs[0], presentation: { kind: 'app', scrollTop: 0, draft: 'not allowed' } }] }).success).toBe(false);
});
