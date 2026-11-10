import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('stacks based on available content width instead of viewport width', () => {
  const css = readFileSync(new URL('./home.css', import.meta.url), 'utf8');
  expect(css).toContain('container-type:inline-size');
  expect(css).toMatch(/@container \(width < 720px\)\s*{\s*\.home-grid { grid-template-columns:minmax\(0,1fr\); }/);
  expect(css).toContain('max-width:1120px');
  expect(css).toContain('align-items:start');
});
