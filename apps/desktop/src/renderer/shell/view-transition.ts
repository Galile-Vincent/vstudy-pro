import { flushSync } from 'react-dom';
let active: ViewTransition | undefined;
let generation = 0;
let reveal: Animation | undefined;
export function transitionTo(apply: () => void, morph = false, immediate = false) {
  const current = ++generation;
  active?.skipTransition();
  active = undefined;
  reveal?.cancel();
  reveal = undefined;
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
        easing:style.getPropertyValue('--ease-out-soft').trim() || 'ease-out',
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
