import { useEffect, useState } from 'react';
import './motion.css';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function AnimatedText({ texts, variant = 'cross-fade' }: { texts: string[]; variant?: 'typewriter' | 'cross-fade' }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const signature = texts.join('\n');
  useEffect(() => { setIndex(0); }, [signature]);
  useEffect(() => {
    if (reduced || paused || texts.length < 2 || index >= texts.length * 3 - 1) return;
    const timer = window.setTimeout(() => setIndex(i => i + 1), 6500);
    return () => window.clearTimeout(timer);
  }, [index, paused, reduced, texts.length]);
  return <span className="animated-text" role={texts.length > 1 ? "group" : undefined} aria-label={texts.length > 1 ? texts[0] : undefined} tabIndex={texts.length > 1 ? 0 : undefined} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <span className="motion-sr">{texts[0]}</span>
    <span aria-hidden="true" className="animated-stack">{texts.map((text, i) => <span key={text} className={i === index % texts.length ? `motion-current motion-${variant}` : 'motion-reserve'}>{text}</span>)}</span>
  </span>;
}
