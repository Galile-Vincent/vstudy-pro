import type { Route, View } from './index';

export type HistoryDirection = 'back' | 'forward';
export type HistoryRoute = Omit<Route, 'view' | 'connectSchool' | 'aiParse'> & { view: Exclude<View, 'welcome'> };
export type RouteHistory = { entries: readonly HistoryRoute[]; index: number };

export function historyRoute(route: Route): HistoryRoute {
  const { view, documentId, conversationId, messageId, courseId, query, title, accountId, target, provider } = route;
  return { view: view === 'welcome' ? 'home' : view, documentId, conversationId, messageId, courseId,
    accountId, target, provider, query: query ? { ...query } : undefined, title };
}

function routeKey(route: HistoryRoute): string {
  return JSON.stringify({ ...route, query: route.query ? Object.entries(route.query).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)) : undefined });
}

export function createRouteHistory(route: Route): RouteHistory {
  return { entries: [historyRoute(route)], index: 0 };
}

export function pushRoute(history: RouteHistory, route: Route): RouteHistory {
  if (route.view === 'welcome') return history;
  const next = historyRoute(route);
  if (routeKey(history.entries[history.index]!) === routeKey(next)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), next].slice(-50);
  return { entries, index: entries.length - 1 };
}

export function canMoveHistory(history: RouteHistory, direction: HistoryDirection): boolean {
  return direction === 'back' ? history.index > 0 : history.index < history.entries.length - 1;
}

export function moveHistory(history: RouteHistory, direction: HistoryDirection): RouteHistory {
  return canMoveHistory(history, direction) ? { ...history, index: history.index + (direction === 'back' ? -1 : 1) } : history;
}
