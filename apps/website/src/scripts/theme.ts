/** One atomic theme update for scheme and palette controls, with an interpolated fallback. */
let current: ViewTransition | undefined;
export function transitionTheme(update: () => void): void {
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  if (!document.startViewTransition) {
    update();
    return;
  }
  current?.skipTransition();
  root.dataset.viewTransition = '';
  const transition = document.startViewTransition(update);
  current = transition;
  void transition.finished.catch(() => {}).finally(() => {
    if (current !== transition) return;
    delete root.dataset.viewTransition;
    current = undefined;
  });
}
