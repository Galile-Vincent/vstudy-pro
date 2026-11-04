import { useEffect, useState, type RefObject } from 'react';
export function useInView(ref: RefObject<HTMLElement | null>, threshold = .2) {
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!!entry?.isIntersecting && entry.intersectionRatio >= threshold);
      if (entry?.isIntersecting) setSeen(true);
    }, { root: ref.current.closest('.welcome'), threshold });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [ref, threshold]);
  return { visible, seen };
}
