import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const rule = (selector: string) => css.split('\n').find(line => line.startsWith(selector));

describe('elevation policy', () => {
  it('keeps every legacy shadow alias flat or on an Astryx overlay shadow', () => {
    const names = ['elevation-flat', 'elevation-raised', 'glass-shadow', 'glass-shadow-hover', 'primary-shadow', 'glass-edge', 'glass-depth'];
    for (const name of names) expect(css, name).toMatch(new RegExp(`--${name}:none;`));
    for (const name of ['elevation-floating', 'glass-shadow-float', 'glass-depth-float'])
      expect(css, name).toMatch(new RegExp(`--${name}:var\\(--shadow-med\\);`));
  });

  it('does not override the Astryx overlay shadows', () => {
    expect(css).not.toMatch(/--shadow-(low|med|high):/);
  });

  it('uses no blur or glass fill on any surface', () => {
    expect(css).not.toMatch(/backdrop-filter:\s*(?!none)/);
    expect(css).toContain('--glass-blur:none;');
    expect(css).toContain('--material-card:var(--surface);');
  });

  it('shadows only floating overlays: menus and popovers medium, dialogs high', () => {
    expect(css).toMatch(/\[data-slot=popover-content\][^{]*\.conversation-list-popover\) \{[^}]*box-shadow:var\(--shadow-med\)/);
    expect(css).toMatch(/\[data-slot=dialog-content\],\.settings-dialog\) \{[^}]*box-shadow:var\(--shadow-high\)/);
    expect(rule('.glass,.glass-pill')).toContain('box-shadow:none');
  });

  it('keeps every radius on the Astryx scale', () => {
    for (const name of ['r-xs', 'r-sm', 'r-md', 'r-lg', 'r-xl', 'r-pill'])
      expect(css, name).toMatch(new RegExp(`--${name}:var\\(--radius-(inner|element|container|full)\\)`));
  });
});

describe('focus ring', () => {
  it('draws on keyboard focus of controls but not on programmatic focus of headings or dialogs', () => {
    expect(css).toMatch(/^:focus-visible \{ outline:var\(--focus-ring\)/m);
    const exemption = (css.match(/^:is\(([^)]*)\):focus-visible \{ outline:none; \}/m)?.[1] ?? '').split(',');
    for (const target of ['h1', 'h2', '[role=heading]', 'dialog', '[role=dialog]']) expect(exemption).toContain(target);
    for (const control of ['button', 'a', 'input', '[role=tab]']) expect(exemption).not.toContain(control);
  });
});

it('keeps library focus distinct from selected outlines in contrast modes', () => {
  const library = readFileSync(new URL('./components/ui/ui.css', import.meta.url), 'utf8');
  const focus = library.match(/html :is\([^{}]+:is\(:focus-visible,[^{}]+\{([^}]+)\}/);
  expect(focus?.[1]).toContain('outline:2px solid var(--focus)');
  expect(focus?.[1]).toContain('outline-offset:2px');
  expect(library.indexOf(focus![0])).toBeGreaterThan(library.lastIndexOf('outline:thin solid var(--ink)'));
});

it('excludes sheets from floating surfaces and contrast selector lists', () => {
  const contexts: string[] = [];
  for (const match of css.matchAll(/([^{}]+)([{}])/g)) {
    if (match[2] === '}') {
      contexts.pop();
      continue;
    }
    const selector = match[1]!.trim();
    const contrast = [...contexts, selector].some(value =>
      /prefers-contrast|forced-colors|data-theme=contrast/.test(value));
    const floating =
      /data-slot=(?:popover|dropdown-menu|select|dialog|tooltip)-content/.test(selector) ||
      /\.(?:settings-dialog|model-popover|conversation-list-popover|select-popup)\b/.test(selector);
    if (contrast || floating)
      expect(selector).not.toMatch(/\[data-slot=["']?sheet-content["']?\]/);
    contexts.push(selector);
  }
});
