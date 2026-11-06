/** Audit the static school band, its localized links, and the motion fallback in the production output. */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dist = join(root, 'apps/website/dist');
for (const language of ['en', 'zh-Hant', 'ja']) {
  const html = await readFile(join(dist, language, 'index.html'), 'utf8');
  const section = html.match(/<section class="schools-section[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, language);
  assert.equal((section.match(/class="school-step"/g) ?? []).length, 3);
  assert.equal((section.match(/<a /g) ?? []).length, 2);
  assert.match(section, /href="https:\/\/stats.moodle.org\/sites\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(section, /class="sr-only"/);
  assert.match(section, new RegExp(`/${language}/docs/connect-your-school/#availability`));
  assert.match(section, /CYCU/);
  assert.doesNotMatch(section, /<button|<input|school-demo|school-slide|school-search|school-controls|data-enhanced|<img/);
  assert.doesNotMatch(section, /opacity:0|visibility:hidden|display:none/);
  const guide = await readFile(join(dist, language, 'docs/connect-your-school/index.html'), 'utf8');
  assert.match(guide, /href="https:\/\/stats.moodle.org\/sites\/"/);
}
const css = await readFile(join(root, 'apps/website/src/styles/schools.css'), 'utf8');
assert.match(css, /@media\(prefers-reduced-motion:no-preference\)/);
assert.match(css, /:root\[data-motion="paused"\][\s\S]*animation:none/);
assert.match(css, /@media\(max-width:1023px\)/);
const globalCss = await readFile(join(root, 'apps/website/src/styles/global.css'), 'utf8');
assert.match(globalCss, /@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none !important; transition:none !important/);
const component = await readFile(join(root, 'apps/website/src/components/Schools.astro'), 'utf8');
assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|carousel/);
assert.match(component, /observer.disconnect\(\)/);
const shots = [];
for (const directory of ['before', 'round-1', 'round-2', 'final', 'prototypes']) {
  for (const name of await readdir(join(fileURLToPath(new URL('.', import.meta.url)), directory))) {
    const path = join(directory, name);
    shots.push({ path, bytes: (await stat(new URL(path, import.meta.url))).size });
  }
}
assert.equal(shots.filter(shot => shot.path.startsWith('final/')).length, 12);
console.log(JSON.stringify({ languages: 3, staticStepsPerLanguage: 3, linksPerBand: 2, oldDemoControls: 0, staticContentWithoutJavaScript: true, reducedMotion: 'CSS audited; native browser preference emulation unavailable in T3 preview', screenshots: shots }, null, 2));
