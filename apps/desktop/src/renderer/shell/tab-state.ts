import { documentIdSchema } from '../../shared/domain';
import { MAX_APP_TABS, TAB_STORAGE_KEY, tabSetSchema, tabRouteSchema, type TabSet, type TabState, type TabPresentation } from '../../shared/app-tabs';
import { createRouteHistory, pushRoute, moveHistory, historyRoute, type HistoryDirection } from './navigation-history';
import type { Route } from './index';

export function createTab(id: string, route: Route, now: number): TabState {
  return { id, history: createRouteHistory(route), title: route.title ?? '',
    icon: route.view === 'workspace' ? 'FileText' : route.view === 'courses' ? 'GraduationCap' : route.view === 'home' ? 'Home' : 'BookOpen',
    lastActiveAt: now, presentation: { kind: route.view === 'workspace' ? 'document' : 'app', scrollTop: 0 } };
}
export function initialTabs(id: string, route: Route = { view: 'home' }, now = 0): TabSet {
  return { version: 1, activeId: id, tabs: [createTab(id, route, now)] };
}
export function activeTab(state: TabSet): TabState { return state.tabs.find(tab => tab.id === state.activeId)!; }
export function currentRoute(state: TabSet): Route {
  const { history } = activeTab(state);
  return history.entries[history.index]!;
}
export type TabAction =
  | { type: 'imported'; id:string; documentId:string }
  | { type: 'open'; tab: TabState }
  | { type: 'close'; id: string; fallback: TabState }
  | { type: 'activate'; id: string; now: number }
  | { type: 'reorder'; ids: string[] }
  | { type: 'replace-route'; id: string; route: Route }
  | { type: 'history'; id: string; direction: HistoryDirection }
  | { type: 'presentation'; id: string; presentation: TabPresentation; title?:string };
export function tabReducer(state: TabSet, action: TabAction): TabSet {
  switch (action.type) {
    case 'open': return state.tabs.length >= MAX_APP_TABS || state.tabs.some(tab => tab.id === action.tab.id) ? state : { ...state, activeId: action.tab.id, tabs: [...state.tabs, action.tab] };
    case 'activate': return state.tabs.some(tab => tab.id === action.id) ? { ...state, activeId: action.id, tabs: state.tabs.map(tab => tab.id === action.id ? { ...tab, lastActiveAt: action.now } : tab) } : state;
    case 'close': {
      const index = state.tabs.findIndex(tab => tab.id === action.id);
      if (index < 0) return state;
      const tabs = state.tabs.filter(tab => tab.id !== action.id);
      if (!tabs.length) return { ...state, activeId: action.fallback.id, tabs: [action.fallback] };
      return { ...state, tabs, activeId: state.activeId === action.id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.activeId };
    }
    case 'reorder': return action.ids.length === state.tabs.length && new Set(action.ids).size === state.tabs.length && action.ids.every(id => state.tabs.some(tab => tab.id === id)) ? { ...state, tabs: action.ids.map(id => state.tabs.find(tab => tab.id === id)!) } : state;
    default: return { ...state, tabs: state.tabs.map(tab => {
      if (tab.id !== action.id) return tab;
      if (action.type === 'imported') return {...tab,history:{...tab.history,entries:tab.history.entries.map((route,index)=>index===tab.history.index && route.view==='moodle' && route.target?.kind==='file' ? {...route,importedDocumentId:documentIdSchema.parse(action.documentId)} : route)}};
      if (action.type === 'presentation') return { ...tab, title:action.title ?? tab.title, presentation: action.presentation };
      if (action.type === 'history') {
        const history = moveHistory(tab.history, action.direction);
        return { ...createTab(tab.id, history.entries[history.index]!, tab.lastActiveAt), history };
      }
      return { ...createTab(tab.id, action.route, tab.lastActiveAt), history: pushRoute(tab.history, action.route) };
    }) };
  }
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function loadTabs(storage: Storage, id: string): TabSet {
  try {
    const saved = storage.getItem(TAB_STORAGE_KEY);
    if (saved !== null) return tabSetSchema.parse(JSON.parse(saved));
    const legacy = storage.getItem('vstudy-route');
    const state = initialTabs(id, legacy ? tabRouteSchema.parse(historyRoute(JSON.parse(legacy) as Route)) : { view: 'home' });
    if (saveTabs(storage, state)) storage.removeItem('vstudy-route');
    return state;
  } catch { return initialTabs(id); }
}
export function saveTabs(storage: Storage, state: TabSet): boolean {
  try { storage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabSetSchema.parse(state))); return true; }
  catch {
    const tabs=state.tabs.map(tab=>{
      if(tab.id===state.activeId || !['app','document'].includes(tab.presentation.kind))return tab;
      const presentation={...tab.presentation};
      if(presentation.kind==='app' || presentation.kind==='document') delete presentation.draft;
      if(presentation.kind==='document') {delete presentation.anchor;delete presentation.anchorOffset;}
      return {...tab,presentation};
    });
    try {storage.setItem(TAB_STORAGE_KEY,JSON.stringify(tabSetSchema.parse({...state,tabs})));return true;} catch {return false;}
  }
}

export function mergeTabPresentation(current:TabPresentation,patch:Partial<TabPresentation>):TabPresentation {
  return patch.kind && patch.kind!==current.kind ? patch as TabPresentation : {...current,...patch} as TabPresentation;
}
