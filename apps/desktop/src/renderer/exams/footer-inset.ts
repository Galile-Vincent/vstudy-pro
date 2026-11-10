import { useCallback } from "react";

const property = "--exam-footer-size";

export function useFooterInset() {
  return useCallback((footer: HTMLElement | null) => {
    const scroller = footer?.closest<HTMLElement>("[data-tab-scroll]");
    if (!footer || !scroller) return;
    const measure = () => scroller.style.setProperty(property, `${footer.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return () => scroller.style.removeProperty(property);
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      scroller.style.removeProperty(property);
    };
  }, []);
}
