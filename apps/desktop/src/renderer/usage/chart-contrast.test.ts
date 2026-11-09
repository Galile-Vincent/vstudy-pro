import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { adjustedTokens, builtinThemes, contrastRatio } from '../../shared/themes';

const mix = (foreground: string, background: string, opacity: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(foreground.slice(i, i + 2), 16) * opacity +
          parseInt(background.slice(i, i + 2), 16) * (1 - opacity),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

const css = readFileSync(new URL('./usage.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
};

it('draws chart fills from opaque tokens, never transparency', () => {
  for (const selector of ['.usage-hatch-ground', '.usage-hatch-line', '.usage-key.input']) {
    const body = rule(selector);
    expect(body).not.toMatch(/transparent|opacity|color-mix|rgba|hsla/);
  }
  expect(rule('.usage-hatch-ground')).toContain('var(--muted)');
  expect(rule('.usage-hatch-line')).toContain('var(--ink)');
});

it('keeps input and output bars at 3:1 or better in every built-in theme and scheme', () => {
  const failures: string[] = [];
  for (const theme of builtinThemes)
    for (const scheme of ['light', 'dark'] as const)
      for (let contrast = 100; contrast <= 150; contrast += 10) {
        const tokens = adjustedTokens(theme[scheme], scheme, contrast);
        const surfaces = [tokens.surface, mix(tokens.ink, tokens.surface, 0.09)];
        const hatch = mix(tokens.ink, tokens.muted, 1 / 3);
        for (const surface of surfaces)
          for (const [name, fill] of [
            ['output', tokens.ink],
            ['input ground', tokens.muted],
            ['input hatch', hatch],
          ] as const) {
            const ratio = contrastRatio(fill, surface);
            if (ratio < 3) failures.push(`${theme.id} ${scheme} ${contrast}% ${name} ${ratio.toFixed(2)}`);
          }
      }
  expect(failures).toEqual([]);
});
