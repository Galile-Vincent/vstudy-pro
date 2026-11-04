import { useEffect, useRef } from 'react';
import { PROVIDER_KINDS } from './facts';
import { providerName } from '../providers';
import { useInView } from './use-in-view';
export function Marquee() {
  const track = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const { visible } = useInView(viewport);
  useEffect(() => {
    const element = track.current;
    if (!visible || !element || typeof ResizeObserver === 'undefined') return;
    const update = () => { const width = element.firstElementChild?.getBoundingClientRect().width ?? 0; element.parentElement!.dataset.overflow = String(width > element.parentElement!.clientWidth); element.style.setProperty('--welcome-marquee', `${width / 32}s`); };
    const observer = new ResizeObserver(update); observer.observe(element.parentElement!); update();
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={viewport} className="w-marquee" aria-hidden="true"><div ref={track}>{[0, 1].map(copy => <span key={copy}>{PROVIDER_KINDS.map(id => <span key={id}>{providerName[id]}</span>)}</span>)}</div></div>;
}
