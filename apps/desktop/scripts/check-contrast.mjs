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
function composite(foreground, background, opacity) {
  return '#' + [1,3,5].map(i => Math.round(parseInt(foreground.slice(i,i+2),16)*opacity
    + parseInt(background.slice(i,i+2),16)*(1-opacity)).toString(16).padStart(2,'0')).join('');
}
let surfaceMinimum=Infinity;
for (const theme of builtinThemes) for (const scheme of ['light','dark']) {
  const tokens=theme[scheme];
  for (const opacity of [1,.88,.72]) for (const tint of ['surface','sidebar']) {
    for (const background of ['background','surface','sidebar','subtle','active']) {
      for (const foreground of ['ink','muted','accent-color','danger','success','warning','info']) {
        const ratio=contrastRatio(tokens[foreground],composite(tokens[tint],tokens[background],opacity));
        surfaceMinimum=Math.min(surfaceMinimum,ratio);
        assert.ok(ratio>=4.5,`${theme.id} ${scheme} ${opacity} translucent ${tint} over ${background}: ${foreground} ${ratio}`);
      }
    }
  }
}
console.log(`Translucent surfaces: minimum text contrast ${surfaceMinimum.toFixed(2)}:1`);
let count=0;
async function audit(url) {
  for (const entry of await readdir(url,{withFileTypes:true})) {
    const path=new URL(entry.name+(entry.isDirectory()?'/':''),url);
    if (entry.isDirectory()) await audit(path);
    else if (entry.name.endsWith('.css')) {
      const css=await readFile(path,'utf8');
      assert.equal(/\boklch\((?!from var\(--(?:accent-color|course-color)\))/.test(css),false,`OKLCH must derive from a semantic theme token in ${path.pathname}`);
      assert.equal(/#[a-f\d]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|lab|lch)\(|prefers-color-scheme|--palette-\d+|:\s*(?:white|black)\b|,\s*(?:white|black)\s+\d/.test(css),false,`Fixed CSS color or scheme override in ${path.pathname}`);
      count++;
    }
  }
}
await audit(new URL('../src/renderer/',import.meta.url));
console.log(`${count} renderer CSS files use semantic theme tokens`);
