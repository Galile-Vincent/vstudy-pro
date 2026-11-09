import { useEffect, useState } from 'react';

/** Keep scaled navigation from consuming the reading surface. */
export function useSidebarOverlay(close: () => void, visible: boolean) {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    let wasOverlay = false;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => measure());
    const measure = () => {
      const elements = document.querySelectorAll(
        '.shell-main, .shell-topbar, .app-tabs, .workspace .app-header',
      );
      for (const element of observed) {
        if (!element.isConnected) {
          resize.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of elements) {
        if (!observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
      }
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
        document.querySelectorAll<HTMLElement>('.app-tabs, .shell-topbar, .workspace .app-header'),
      ).filter(element => element.getClientRects().length)
        .map(element => element.getBoundingClientRect().bottom));
      sidebar?.style.setProperty('--sidebar-overlay-top', `${top}px`);
      if (next && !wasOverlay) close();
      wasOverlay = next;
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const layout = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes'
        || [...record.addedNodes, ...record.removedNodes].some(node =>
          node instanceof Element && (node.matches(
            '.shell-topbar, .app-tabs, .workspace, .app-header',
          ) || node.querySelector('.shell-topbar, .app-tabs, .workspace .app-header')),
        ))) measure();
    });
    const shell = document.querySelector('.app-shell');
    if (shell) layout.observe(shell, {
      attributes: true, attributeFilter: ['data-view'], childList: true, subtree: true,
    });
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); layout.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); };
  }, [close]);
  useEffect(() => {
    if (!overlay || !visible) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.closest('.shell-sidebar')) return;
      if (active.closest('input, textarea, select, [contenteditable], [role=menu], [role=dialog]')) return;
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
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.shell-sidebar, .shell-toggle, .workspace .app-header')) return;
      if (target.closest('[data-radix-popper-content-wrapper], [role=dialog]')) return;
      close();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('pointerdown', outside);
    };
  }, [overlay, visible, close]);
  return overlay;
}
