import { flushSync } from 'react-dom';
import type { HistoryDirection } from './navigation-history';
let active: ViewTransition | undefined;
let generation = 0;
let reveal: Animation | undefined;
export function transitionTo(apply: () => void, morph = false, immediate = false, direction?: HistoryDirection) {
  const current = ++generation;
  active?.skipTransition();
  active = undefined;
  reveal?.cancel();
  reveal = undefined;
  delete document.documentElement.dataset.historyDirection;
  if (immediate) {
    flushSync(apply);
    const content = document.getElementById('shell-content');
    if (content?.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const style = getComputedStyle(content);
      reveal = content.animate([
        { opacity:0, transform:'translateY(var(--space-1))' },
        { opacity:1, transform:'none' },
      ], {
        duration:parseFloat(style.getPropertyValue('--motion-base')) || 0,
        easing:style.getPropertyValue('--ease-entrance').trim() || 'ease-out',
      });
    }
    return;
  }
  const source = morph ? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.library-document, .home-row') : null;
  let applied = false;
  const update = () => {
    if (applied || current !== generation) return;
    applied = true; flushSync(apply);
    if (source) document.querySelector<HTMLElement>('.reading-pane')?.style.setProperty('view-transition-name', 'vt-document');
  };
  if (!document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible') { if (direction) update(); else apply(); return; }
  if (direction) document.documentElement.dataset.historyDirection = direction;
  source?.style.setProperty('view-transition-name', 'vt-document');
  try {
    const transition = document.startViewTransition(update); active = transition;
    void transition.ready.catch(() => undefined);
    void transition.finished.catch(() => undefined).finally(() => {
      source?.style.removeProperty('view-transition-name');
      if (active === transition) { document.querySelector<HTMLElement>('.reading-pane')?.style.removeProperty('view-transition-name'); active = undefined; delete document.documentElement.dataset.historyDirection; }
    });
  } catch { delete document.documentElement.dataset.historyDirection; source?.style.removeProperty('view-transition-name'); update(); }
}
