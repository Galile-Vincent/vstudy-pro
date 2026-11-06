/** Checks the actual shipped theme model and prevents new fixed renderer CSS colors. */
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { courseArtContrast } from './course-art-contrast.mjs';
import { builtinThemes, adjustedTokens, contrastFailures, contrastRatio } from '../src/shared/themes/index.ts';

for (const theme of builtinThemes) {
  for (const scheme of ['light','dark']) {
    for (let contrast=100;contrast<=150;contrast++) {
      const tokens=adjustedTokens(theme[scheme],scheme,contrast);
      const failures=contrastFailures(tokens);
      const art=courseArtContrast(tokens,scheme);
      assert.ok(art.label >= 4.5 && art.hero >= 4.5, `${theme.id} ${scheme} ${contrast}% course scrim AA ${JSON.stringify(art)}`);
      assert.deepEqual(failures,[],`${theme.id} ${scheme} ${contrast}%`);
    }
    assert.ok(contrastRatio(theme[scheme].ink,theme[scheme].surface)>=4.5,`${theme.id} ${scheme} document-cover label over opaque surface scrim`);
    console.log(`${theme.name} ${scheme}: WCAG AA passed at every contrast setting`);
  }
}
let count=0;
async function audit(url) {
  for (const entry of await readdir(url,{withFileTypes:true})) {
    const path=new URL(entry.name+(entry.isDirectory()?'/':''),url);
    if (entry.isDirectory()) await audit(path);
    else if (entry.name.endsWith('.css')) {
      const css=await readFile(path,'utf8');
      assert.equal(/#[a-f\d]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch)\(|prefers-color-scheme|--palette-\d+|:\s*(?:white|black)\b|,\s*(?:white|black)\s+\d/.test(css),false,`Fixed CSS color or scheme override in ${path.pathname}`);
      count++;
    }
  }
}
await audit(new URL('../src/renderer/',import.meta.url));
console.log(`${count} renderer CSS files use semantic theme tokens`);
