import { useEffect, useRef } from 'react';
import { PROVIDER_KINDS } from './facts';
import { providerName } from '../providers';
export function Marquee() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = track.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => element.style.setProperty('--welcome-marquee', `${element.scrollWidth / 2 / 32}s`);
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => observer.disconnect();
  }, []);
  return <div className="w-marquee" aria-hidden="true"><div ref={track}>{[0, 1].map(copy => <span key={copy}>{PROVIDER_KINDS.map(id => <span key={id}>{providerName[id]}</span>)}</span>)}</div></div>;
}
