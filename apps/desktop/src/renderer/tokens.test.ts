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
