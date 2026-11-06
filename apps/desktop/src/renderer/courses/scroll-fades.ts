import { useEffect, type RefObject } from 'react';

export function useScrollFades(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const selector = '.moodle-tabs [role="tablist"], .moodle-table-scroll, .moodle-safe-html table';
    const update = (element: HTMLElement) => {
      element.dataset.scrollFade = 'true';
      element.style.setProperty('--mask-start', element.scrollLeft > 1 ? '0px' : '-40px');
      element.style.setProperty('--mask-end', element.scrollLeft + element.clientWidth < element.scrollWidth - 1 ? '-40px' : '0px');
      element.tabIndex = 0;
    };
    const resize = new ResizeObserver(() => page.querySelectorAll<HTMLElement>(selector).forEach(update));
    const scan = () => page.querySelectorAll<HTMLElement>(selector).forEach(element => {update(element);resize.observe(element);});
    const onScroll = (event: Event) => {if (event.target instanceof HTMLElement && event.target.matches(selector)) update(event.target);};
    const mutations = new MutationObserver(scan);
    mutations.observe(page, {childList:true,subtree:true});
    page.addEventListener('scroll', onScroll, true);
    resize.observe(page); scan();
    return () => {mutations.disconnect();resize.disconnect();page.removeEventListener('scroll', onScroll, true);};
  }, [root]);
}
