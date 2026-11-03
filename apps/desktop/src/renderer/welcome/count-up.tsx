import { useEffect, useRef, useState } from 'react';
export function CountUp({ value, animate }: { value: number; animate: boolean }) {
  const completed = useRef(false);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (completed.current) { setShown(value); return; }
    if (!animate) { setShown(value); return; }
    completed.current = true;
    let frame = 0, start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / 600);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);
  return <><span className="motion-sr">{value}</span><span aria-hidden="true">{shown}</span></>;
}
