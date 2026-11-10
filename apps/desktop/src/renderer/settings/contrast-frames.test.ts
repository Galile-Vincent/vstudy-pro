import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('../components/ui/ui.css', import.meta.url), 'utf8');
it('frames cards and segmented controls without changing their box size or framing bare rows', () => {
  const frames = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([,selector = '']) => selector.includes('[data-slot=card]') && selector.includes('.astryx-segmented-control'));
  expect(frames).toHaveLength(2);
  for (const [,selector, declarations] of frames) {
    expect(selector).not.toContain('[data-slot=setting-row]');
    expect(declarations).not.toMatch(/(?:^|;)\s*border\s*:/);
    expect(declarations).toMatch(/outline:1px solid var\(--hairline\)/);
    expect(declarations).toMatch(/outline-offset:0/);
  }
});
