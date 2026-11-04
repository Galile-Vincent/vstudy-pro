import { flushSync } from 'react-dom';
let active: ViewTransition | undefined;
let generation = 0;
export function transitionTo(apply: () => void, morph = false, immediate = false) {
  const current = ++generation;
  active?.skipTransition();
  active = undefined;
  if (immediate) { apply(); return; }
  const source = morph ? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.library-document, .home-row') : null;
  let applied = false;
  const update = () => {
    if (applied || current !== generation) return;
    applied = true; flushSync(apply);
    if (source) document.querySelector<HTMLElement>('.reading-pane')?.style.setProperty('view-transition-name', 'vt-document');
  };
  if (!document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible') { apply(); return; }
  source?.style.setProperty('view-transition-name', 'vt-document');
  try {
    const transition = document.startViewTransition(update); active = transition;
    void transition.ready.catch(() => undefined);
    void transition.finished.catch(() => undefined).finally(() => {
      source?.style.removeProperty('view-transition-name');
      if (active === transition) { document.querySelector<HTMLElement>('.reading-pane')?.style.removeProperty('view-transition-name'); active = undefined; }
    });
  } catch { source?.style.removeProperty('view-transition-name'); update(); }
}
