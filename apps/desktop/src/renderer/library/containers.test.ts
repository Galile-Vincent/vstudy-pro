import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('resolves every named container query against the final declarations', () => {
  const css = ['ui3.css', 'library.css', 'library-surface.css']
    .map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  const containers = new Map<string, string[]>();
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const declaration of block[2]!.matchAll(/container(?:-name)?\s*:\s*([^;]+)/g)) {
      containers.set(block[1]!.trim(), declaration[1]!.split('/')[0]!.trim().split(/\s+/));
    }
  }
  const names = new Set([...containers.values()].flat());
  for (const query of css.matchAll(/@container\s+([\w-]+)\s*\(/g)) {
    expect(names.has(query[1]!), query[1]).toBe(true);
  }
});
