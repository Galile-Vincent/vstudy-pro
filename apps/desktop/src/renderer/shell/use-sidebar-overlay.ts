import { useEffect, useState } from 'react';

/** Keep scaled navigation from consuming the reading surface. */
export function useSidebarOverlay(close: () => void, visible: boolean) {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    let wasOverlay = false;
    const measure = () => {
      const sidebar = document.querySelector<HTMLElement>('.shell-sidebar');
      const width = sidebar ? parseFloat(getComputedStyle(sidebar).width) : 0;
      const next = width > window.innerWidth * .4;
      setOverlay(next);
      const toggle = document.querySelector<HTMLElement>('.shell-toggle');
      const top = toggle?.closest('header')?.getBoundingClientRect().bottom ?? 0;
      sidebar?.style.setProperty('--sidebar-overlay-top', `${top}px`);
      if (next && !wasOverlay) close();
      wasOverlay = next;
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const resize = new ResizeObserver(measure);
    const main = document.querySelector('.shell-main');
    if (main) resize.observe(main);
    const topbar = document.querySelector('.shell-topbar');
    if (topbar) resize.observe(topbar);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); };
  }, [close]);
  useEffect(() => {
    if (!overlay || !visible) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
      document.querySelector<HTMLElement>('.shell-toggle')?.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [overlay, visible, close]);
  return overlay;
}
