import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

describe('elevation policy', () => {
  it('defines no legacy elevation, glass or material alias', () => {
    expect(css).not.toMatch(/--(?:elevation|glass|material|surface-card|primary-shadow)[\w-]*:/);
    expect(css).not.toMatch(/\.glass/);
  });

  it('does not override the Astryx overlay shadows', () => {
    expect(css).not.toMatch(/--shadow-(low|med|high):/);
  });

  it('uses no blur or glass fill on any surface', () => {
    expect(css).not.toMatch(/backdrop-filter:\s*(?!none)/);
  });

  it('shadows only floating overlays: menus and popovers medium, dialogs high', () => {
    expect(css).toMatch(/\[data-slot=popover-content\][^{]*\.conversation-list-popover\) \{[^}]*box-shadow:var\(--shadow-med\)/);
    expect(css).toMatch(/\.settings-dialog\) \{[^}]*box-shadow:var\(--shadow-high\)/);
  });

  it('keeps every radius on the Astryx scale', () => {
    expect(css).not.toMatch(/--r-(?:xs|sm|md|lg|xl|pill):/);
    expect(css).toContain('--r-outer:var(--radius-container);');
  });
});

describe('border strength', () => {
  it('draws dividers and card edges from a quiet ink mix and keeps the 3:1 theme line for controls', () => {
    expect(css).toMatch(/--line:color-mix\(in oklab,var\(--ink\) 10%,transparent\);/);
    expect(css).toContain('html[data-contrast=more] { --line:var(--line-strong); }');
    expect(css).toContain('--color-border:var(--line);');
    expect(css).toContain('--color-border-emphasized:var(--line-strong);');
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
