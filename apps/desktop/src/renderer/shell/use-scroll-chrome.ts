/** Scroll state belongs to the scroller. CSS fades only the fixed or sticky chrome above it. */
import { useEffect } from 'react';

export function useScrollChrome(): void {
  useEffect(() => {
    const scroll = (event: Event) => {
      if (event.target instanceof HTMLElement) {
        const target = event.target;
        const scrolled = String(target.scrollTop > 1);
        if (target.dataset.scrolled !== scrolled) target.dataset.scrolled = scrolled;
      }
    };
    document.addEventListener('scroll', scroll, {capture:true, passive:true});
    return () => document.removeEventListener('scroll', scroll, true);
  }, []);
}
