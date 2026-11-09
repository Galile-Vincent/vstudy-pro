import { useEffect, useState } from 'react';

/** Keep scaled navigation from consuming the reading surface. */
export function useSidebarOverlay(close: () => void, visible: boolean) {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    let wasOverlay = false;
    const measure = () => {
      const sidebar = document.querySelector<HTMLElement>('.shell-sidebar');
      const shell = sidebar?.closest<HTMLElement>('.app-shell');
      if (!sidebar || !shell) return;
      // Probe base layout without disturbing live layout or exit transitions.
      const probeShell = shell.cloneNode(false) as HTMLElement;
      const probe = sidebar.cloneNode(false) as HTMLElement;
      probeShell.dataset.sidebarOverlay = 'false';
      probeShell.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
      probe.hidden = false;
      probe.style.transition = 'none';
      probeShell.append(probe);
      shell.parentElement?.append(probeShell);
      const position = getComputedStyle(probe).position;
      const next = position === 'absolute' || position === 'fixed';
      probeShell.remove();
      setOverlay(next);
      const top = Math.max(0, ...Array.from(
        document.querySelectorAll<HTMLElement>('.app-tabs, .shell-topbar'),
      ).filter(element => element.getClientRects().length)
        .map(element => element.getBoundingClientRect().bottom));
      sidebar?.style.setProperty('--sidebar-overlay-top', `${top}px`);
      if (next && !wasOverlay) close();
      wasOverlay = next;
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const resize = new ResizeObserver(measure);
    const main = document.querySelector('.shell-main');
    if (main) resize.observe(main);
    const layout = new MutationObserver(measure);
    const shell = document.querySelector('.app-shell');
    if (shell) layout.observe(shell, { attributes: true, attributeFilter: ['data-view'] });
    const topbar = document.querySelector('.shell-topbar');
    if (topbar) resize.observe(topbar);
    const tabs = document.querySelector('.app-tabs');
    if (tabs) resize.observe(tabs);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); layout.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); };
  }, [close]);
  useEffect(() => {
    if (!overlay || !visible) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
      const toggles = document.querySelectorAll<HTMLElement>(
        '.shell-toggle, .workspace .app-header button[aria-label]',
      );
      const label = document.querySelector('.shell-toggle')?.getAttribute('aria-label');
      const toggle = Array.from(toggles).find(element =>
        element.getAttribute('aria-label') === label && element.getClientRects().length,
      );
      (toggle ?? document.querySelector<HTMLElement>('[role=tab][aria-selected=true]'))?.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [overlay, visible, close]);
  return overlay;
}
