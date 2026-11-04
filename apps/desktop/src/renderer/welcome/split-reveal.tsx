import { useState, type CSSProperties } from 'react';
export function splitGroups(text: string, language: string): string[] {
  if (text.includes('\u200b')) return text.split('\u200b');
  if (!Intl.Segmenter) return [text];
  const words: string[] = [];
  for (const part of new Intl.Segmenter(language, { granularity: 'word' }).segment(text)) {
    if (part.isWordLike || !words.length) words.push(part.segment);
    else words[words.length - 1] += part.segment;
  }
  const size = Math.ceil(words.length / 8);
  return Array.from({ length: Math.ceil(words.length / size) }, (_, i) => words.slice(i * size, (i + 1) * size).join(''));
}
export function SplitReveal({ text, language }: { text: string; language: string }) {
  const [revealing, setRevealing] = useState(true);
  const groups = splitGroups(text, language);
  return <h1 tabIndex={-1} id="welcome-title" className={revealing ? 'is-revealing' : ''}>
    <span className="motion-sr">{text}</span><span aria-hidden="true">{groups.map((group, i) => <span className="w-word" key={i} style={{ '--i': i } as CSSProperties} onAnimationEnd={() => { if (i === groups.length - 1) setRevealing(false); }}>{group}</span>)}</span>
  </h1>;
}
