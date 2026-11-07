import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useCourseMovement(root: RefObject<HTMLElement | null>, order: string) {
  const previous = useRef(new Map<string, DOMRect>());
  const focused = useRef<HTMLElement | null>(null);
  const prepare = () => {
    previous.current.clear();
    focused.current = document.activeElement instanceof HTMLElement && root.current?.contains(document.activeElement) ? document.activeElement : null;
    root.current?.querySelectorAll<HTMLElement>('[data-course-id]').forEach(row => previous.current.set(row.dataset.courseId!,row.getBoundingClientRect()));
  };
  useLayoutEffect(() => {
    if (focused.current?.isConnected && document.activeElement !== focused.current) focused.current.focus({preventScroll:true});
    focused.current=null;
    if (!previous.current.size) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {previous.current.clear();return;}
    root.current?.querySelectorAll<HTMLElement>('[data-course-id]').forEach(row => {
      const before = previous.current.get(row.dataset.courseId!);
      if (!before) return;
      row.getAnimations().forEach(animation => animation.cancel());
      const after = row.getBoundingClientRect(), x = before.x-after.x, y = before.y-after.y;
      if (x || y) row.animate([{transform:`translate(${x}px, ${y}px)`},{transform:'translate(0, 0)'}],{duration:180,easing:'ease-out'});
    });
    previous.current.clear();
  }, [order,root]);
  return prepare;
}
