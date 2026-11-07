import type { HistoryDirection } from './navigation-history';

export const swipeThreshold = 120;
export type SwipeGesture =
  | { phase: 'pending'; x: number; y: number }
  | { phase: 'tracking'; direction: HistoryDirection; distance: number; deltas: readonly number[] }
  | { phase: 'ignored' };
export type SwipeSample = { x: number; y: number; blocked: boolean; canBack: boolean; canForward: boolean };
export type SwipeUpdate = { gesture: SwipeGesture; released?: HistoryDirection | undefined };
export const pendingSwipe = (): SwipeGesture => ({ phase: 'pending', x: 0, y: 0 });

// Momentum decay heuristic adapted from T3 Code (MIT).
export function isMomentumTail(deltas: readonly number[]): boolean {
  if (deltas.length < 5 || deltas.some(delta => delta <= 0)) return false;
  const ratios = deltas.slice(1).map((delta, index) => delta / deltas[index]!);
  return ratios.every(ratio => ratio >= .7 && ratio < 1) && Math.max(...ratios) - Math.min(...ratios) < .1;
}

export function releaseSwipe(gesture: SwipeGesture): SwipeUpdate {
  return { gesture: { phase: 'ignored' }, released: gesture.phase === 'tracking' && gesture.distance >= swipeThreshold ? gesture.direction : undefined };
}

export function advanceSwipe(gesture: SwipeGesture, sample: SwipeSample): SwipeUpdate {
  if (gesture.phase === 'ignored') return { gesture };
  if (sample.blocked) return { gesture: { phase: 'ignored' } };
  if (gesture.phase === 'pending') {
    const x = gesture.x + sample.x, y = gesture.y + sample.y;
    if (Math.abs(x) + Math.abs(y) < 8) return { gesture: { phase: 'pending', x, y } };
    const direction = x < 0 ? 'back' : 'forward';
    if (Math.abs(x) <= Math.abs(y) || !(direction === 'back' ? sample.canBack : sample.canForward)) return { gesture: { phase: 'ignored' } };
    return { gesture: { phase: 'tracking', direction, distance: Math.abs(x), deltas: [] } };
  }
  if (sample.x === 0 && sample.y === 0) return releaseSwipe(gesture);
  const delta = sample.x * (gesture.direction === 'back' ? -1 : 1);
  const deltas = [...gesture.deltas.slice(-4), delta];
  if (isMomentumTail(deltas)) return releaseSwipe(gesture);
  return { gesture: { ...gesture, distance: Math.max(0, gesture.distance + delta), deltas } };
}
