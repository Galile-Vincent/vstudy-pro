import { useEffect, useState } from 'react';

/** Keep scaled navigation from consuming the reading surface. */
export function useSidebarOverlay(close: () => void) {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    let wasOverlay = false;
    const measure = () => {
      const sidebar = document.querySelector<HTMLElement>('.shell-sidebar');
      const width = sidebar ? parseFloat(getComputedStyle(sidebar).width) : 0;
      const next = width > window.innerWidth * .4;
      setOverlay(next);
      if (next && !wasOverlay) close();
      wasOverlay = next;
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [close]);
  return overlay;
}
