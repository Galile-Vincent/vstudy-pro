import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  adjustedTokens,
  builtinThemes,
  contrastFailures,
  contrastRatio,
  type ThemeTokens,
} from '../../shared/themes';

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

const fillOf = (selector: string, tokens: ThemeTokens) => {
  const match = /fill:\s*var\(--([\w-]+)\)/.exec(rule(selector));
  expect(match, selector).not.toBeNull();
  return tokens[match![1] as keyof ThemeTokens];
};

const grey = (level: number) => '#' + level.toString(16).padStart(2, '0').repeat(3);

const adversarialThemes = () => {
  const base = builtinThemes[0]!;
  const themes: { name: string; tokens: ThemeTokens; scheme: 'light' | 'dark' }[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const t = base[scheme];
    themes.push({ name: 'muted equals ink', scheme, tokens: { ...t, muted: t.ink } });
    themes.push({ name: 'muted equals surface', scheme, tokens: { ...t, muted: t.surface } });
    const surface = scheme === 'light' ? '#ffffff' : '#000000';
    const ink = grey(0x76);
    themes.push({
      name: 'ink near surface',
      scheme,
      tokens: { ...t, surface, ink, muted: ink },
    });
  }
  return themes;
};

it('draws chart fills from opaque tokens, never transparency', () => {
  for (const selector of ['.usage-hatch-ground', '.usage-hatch-line', '.usage-key.input']) {
    const body = rule(selector);
    expect(body).not.toMatch(/transparent|opacity|color-mix|rgba|hsla/);
  }
  expect(rule('.usage-hatch-ground')).toContain('var(--ink)');
  expect(rule('.usage-hatch-line')).toContain('var(--surface)');
  expect(rule('.usage-key.input')).not.toContain('var(--muted)');
});

it('keeps input hatching distinct from output in themes where muted collapses', () => {
  const failures: string[] = [];
  for (const { name, tokens, scheme } of adversarialThemes()) {
    for (let contrast = 100; contrast <= 150; contrast += 10) {
      const t = adjustedTokens(tokens, scheme, contrast);
      const output = fillOf('.usage-bar-output', t);
      const ground = fillOf('.usage-hatch-ground', t);
      const line = fillOf('.usage-hatch-line', t);
      const label = `${name} ${scheme} ${contrast}%`;
      if (new Set([ground, line]).size < 2) failures.push(`${label} hatch collapsed`);
      if (new Set([ground, line]).has(output) === false)
        failures.push(`${label} pattern shares no paint with output`);
      if (line === output) failures.push(`${label} hatch line equals output`);
      const ratio = contrastRatio(line, ground);
      if (ratio < 3) failures.push(`${label} hatch ${ratio.toFixed(2)}`);
      const bar = contrastRatio(ground, t.surface);
      if (bar < 3) failures.push(`${label} bar vs surface ${bar.toFixed(2)}`);
    }
  }
  expect(failures).toEqual([]);
});

it('adversarial themes pass the chart surface validation they target', () => {
  const [mutedInk, , nearSurface] = adversarialThemes();
  const surfaceFailures = (tokens: ThemeTokens) =>
    contrastFailures(tokens).filter((f) => f.includes('/ surface:'));
  expect(surfaceFailures(mutedInk!.tokens)).toEqual([]);
  expect(surfaceFailures(nearSurface!.tokens)).toEqual([]);
});

it('keeps the forced-colors input pattern drawn from two system colours', () => {
  const start = css.indexOf('@media (forced-colors: active)');
  const forced = css.slice(start, css.indexOf('\n}\n', start));
  expect(forced).toMatch(/\.usage-hatch-ground \{\s*fill: CanvasText/);
  expect(forced).toMatch(/\.usage-hatch-line \{\s*fill: Canvas;/);
  expect(forced).toMatch(/\.usage-bar-input \{\s*stroke: CanvasText/);
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
