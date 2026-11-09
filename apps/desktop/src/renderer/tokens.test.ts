import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const declarations = [...css.matchAll(/(--[\w-]+):([^;{}]+);/g)];
function resolve(value: string, dark: boolean): string {
  return value.replace(/var\((--[\w-]+)\)/g, (original, name: string) => {
    if (!/shadow|glass-(edge|depth)|elevation/.test(name) || name === '--shadow-color') return original;
    const matches = declarations.filter(match => match[1] === name);
    const definition = dark ? matches.at(-1) : matches[0];
    if (!definition) throw new Error(`Missing shadow token ${name}`);
    return resolve(definition[2]!, dark);
  });
}

describe('surface shadow geometry', () => {
  for (const dark of [false, true]) {
    it(`keeps card and floating shadows centered in ${dark ? 'dark' : 'light'}`, () => {
      for (const name of ['glass-shadow', 'glass-shadow-hover', 'glass-shadow-float', 'elevation-raised', 'elevation-floating', 'course-shadow', 'art-reader-shadow', 'primary-shadow', 'shadow-legacy-0', 'shadow-legacy-1', 'shadow-legacy-2', 'shadow-legacy-4']) {
        const value = resolve(`var(--${name})`, dark);
        const layers = [...value.matchAll(/(?:^|,)(?:inset\s+)?\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?(?=\s)/g)];
        expect(layers.length, name).toBeGreaterThan(0);
        for (const layer of layers) {
          expect(Number(layer[1]), name).toBe(0);
          expect(Number(layer[2]), name).toBe(0);
          expect(Number(layer[3]), name).toBeLessThanOrEqual(/float|legacy/.test(name) ? 12 : 2);
        }
      }
    });
  }
});

it('keeps opaque-mode hover fills distinct from their base fills', () => {
  for (const selector of [
    'html[data-reduced-transparency=true],html[data-theme=contrast]',
    '@media(prefers-reduced-transparency:reduce)',
    '@media(prefers-contrast:more)',
  ]) {
    const block = css.split(selector).slice(1).map(part => part.split('}')[0]!)
      .find(part => part.includes('--glass-fill:'))!;
    const base = block.match(/--glass-fill:([^;]+);/)?.[1];
    const hover = block.match(/--glass-fill-hover:([^;]+);/)?.[1];
    expect(base, selector).toBeTruthy();
    expect(hover, selector).toContain('color-mix(');
    expect(hover, selector).not.toBe(base);
  }
});

it('keeps library focus distinct from selected outlines in contrast modes', () => {
  const library = readFileSync(new URL('./components/ui/ui.css', import.meta.url), 'utf8');
  const focus = library.match(/html :is\([^{}]+:is\(:focus-visible,[^{}]+\{([^}]+)\}/);
  expect(focus?.[1]).toContain('outline:2px solid var(--focus)');
  expect(focus?.[1]).toContain('outline-offset:2px');
  expect(library.indexOf(focus![0])).toBeGreaterThan(library.lastIndexOf('outline:thin solid var(--ink)'));
});
