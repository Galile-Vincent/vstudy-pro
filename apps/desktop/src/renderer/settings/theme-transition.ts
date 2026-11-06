/** User appearance changes share one cancellable transition. Startup and system sync paint immediately. */
export function createThemeTransition(root: HTMLElement = document.documentElement) {
  let active: ViewTransition | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  return (apply: () => void, animate: boolean): void => {
    const current = ++generation;
    active?.skipTransition();
    active = undefined;
    clearTimeout(timer);
    delete root.dataset.themeTransition;
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible') {
      apply();
      return;
    }
    const cleanup = () => {
      if (current !== generation) return;
      delete root.dataset.themeTransition;
      active = undefined;
    };
    let applied = false;
    const update = () => {
      if (applied || current !== generation) return;
      applied = true;
      apply();
    };
    if (document.startViewTransition) {
      root.dataset.themeTransition = 'view';
      try {
        const transition = document.startViewTransition(update);
        active = transition;
        void transition.ready.catch(() => undefined);
        void transition.finished.catch(() => undefined).finally(cleanup);
        return;
      } catch { /* A navigation snapshot can already own the document. Interpolate tokens instead. */ }
    }
    root.dataset.themeTransition = 'tokens';
    void getComputedStyle(root).getPropertyValue('--background');
    update();
    timer = setTimeout(cleanup, 320);
  };
}
