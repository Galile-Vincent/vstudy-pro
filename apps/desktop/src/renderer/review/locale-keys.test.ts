import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import en from '../../shared/locales/en/review.json';
import ja from '../../shared/locales/ja/review.json';
import zhHant from '../../shared/locales/zh-Hant/review.json';

const here = dirname(fileURLToPath(import.meta.url));
const renderer = join(here, '..');
const sources = [...readdirSync(here).map(name => join(here, name)), join(renderer, 'chat.tsx'), join(renderer, 'tutor-mode-control.tsx')]
  .filter(file => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith('dev-mock.ts'));
const used = new Set<string>(), families = new Set<string>();
for (const file of sources) {
  for (const match of readFileSync(file, 'utf8').matchAll(/(?<![\w:])review:([a-z0-9_]*)(?:(\$\{)|(?![\w:]))/g)) (match[2] ? families : used).add(match[1]!);
}
const catalogs = { en, ja, 'zh-Hant': zhHant } as Record<string, Record<string, string>>;
it('finds the keys the renderer uses', () => {
  expect(used.size).toBeGreaterThan(80);
  expect(used.has('consent_turn_on')).toBe(true);
});
it.each(Object.entries(catalogs))('defines every review key the renderer uses statically in %s', (_language, catalog) => {
  const base = (key: string) => key.replace(/_(one|other)$/, '');
  const defined = new Set(Object.keys(catalog).map(base));
  expect([...used].filter(key => !(key in catalog) && !defined.has(key)).sort()).toEqual([]);
});
it.each(Object.entries(catalogs))('defines at least one key for each dynamic review key family in %s', (_language, catalog) => {
  expect([...families].filter(prefix => prefix && !Object.keys(catalog).some(key => key.startsWith(prefix))).sort()).toEqual([]);
});
