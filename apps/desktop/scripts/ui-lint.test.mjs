import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, regressions, collect, run } from './ui-lint.mjs';
test('counts unsafe declarations while accepting tokens and focus rings', async () => {
  assert.deepEqual(inspect(await readFile(new URL('./fixtures/ui-lint.css',import.meta.url),'utf8')), {shadow:1,radius:1,color:2,backdrop:1,'surface-class':1});
  assert.equal(inspect('.x { box-shadow: 0 0 0 2px var(--focus), 3px 4px black; }').shadow,1);
  assert.equal(inspect('const style = {boxShadow: "var(--shadow-med)", backdropFilter: "var(--backdrop-none)"}',false).shadow,0);
  assert.equal(inspect('const style = {borderRadius: "8px", color: "rgb(1,2,3)"}',false).radius,1);
});
test('ratchets by file and rule, including new files', () => {
  const old = {'a.css':inspect('.a { color:#fff; border-radius:8px; }')};
  assert.equal(regressions({'a.css':inspect('.a { color:#fff; }')},old).length,0);
  assert.equal(regressions({'a.css':inspect('.a { color:#fff; color:#fff; }')},old).length,1);
  assert.equal(regressions({'b.css':old['a.css']},old).length,2);
});
test('excludes library and token sources and refuses baseline increases on disk', async () => {
  const root = await mkdtemp(join(tmpdir(),'ui-lint-'));
  try {
    await mkdir(join(root,'components/ui'),{recursive:true});
    await writeFile(join(root,'components/ui/card.tsx'),'#fff');
    await writeFile(join(root,'tokens.css'),'#fff');
    const file = join(root,'feature.css'), baselinePath = join(root,'baseline.json');
    await writeFile(file,'.a { color:#fff; }');
    assert.deepEqual(Object.keys(await collect(root)),['feature.css']);
    assert.equal(await run({root,baselinePath,update:true}),0);
    const baseline = await readFile(baselinePath,'utf8');
    await writeFile(file,'.a { color:#fff; color:#fff; }');
    assert.equal(await run({root,baselinePath,update:true}),1);
    assert.equal(await readFile(baselinePath,'utf8'),baseline);
    await writeFile(file,'.a { color:var(--ink); }');
    assert.equal(await run({root,baselinePath,update:true}),0);
    assert.deepEqual(JSON.parse(await readFile(baselinePath,'utf8')),{});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('accepts token radii and catches physical corners and numeric styles', () => {
  assert.equal(inspect('.x { border-radius: calc(var(--radius-container) - 2px); border-top-left-radius: var(--radius-element) 8px; }').radius, 1);
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    assert.equal(inspect(`.x { border-${corner}-radius: 8px; }`).radius, 1);
  }
  assert.equal(inspect(`const style = {borderRadius: 8, borderRadius: '8px'}`, false).radius, 2);
});
test('normalizes important and accepts quoted React keys', () => {
  assert.equal(inspect('.x { box-shadow:none!important; backdrop-filter:var(--x)!important; }').shadow, 0);
  assert.equal(inspect('.x { backdrop-filter:var(--x)!important; }').backdrop, 0);
  assert.equal(inspect(`const style = {"boxShadow": "none!important", "backdropFilter": "var(--x)!important"}`, false).shadow, 0);
  assert.equal(inspect(`const style = {"boxShadow": "0 4px 8px black"}`, false).shadow, 1);
});
test('counts color values in declarations and styles without counting anchors or text', () => {
  assert.equal(inspect('<a href="#abc" id="abc">#fff plain text</a>', false).color, 0);
  assert.equal(inspect('.x { content:"#abc"; --id:#abc; } #abc {}').color, 0);
  for (const value of ['#abc', 'rgb(1,2,3)', 'rgba(1,2,3,.5)', 'hsl(0 0% 0%)', 'hsla(0,0%,0%,.5)', 'oklch(.5 .2 30)', 'oklab(.5 .2 .1)', 'lab(50 2 3)', 'lch(50 2 30)', 'color-mix(in srgb, var(--ink), red)']) {
    assert.equal(inspect(`.x { background: ${value}; }`).color, 1, value);
    assert.equal(inspect(`const style = {"borderTopColor": "${value}"}`, false).color, 1, value);
  }
  assert.equal(inspect('.x { background: color-mix(in oklab,var(--ink),var(--surface)); }').color, 0);
  for (const key of ['color', 'backgroundColor', 'outlineColor', 'fill', 'stroke', 'boxShadow', 'textShadow', 'caretColor', 'accentColor']) {
    assert.equal(inspect(`const style = {${key}: '#abc'}`, false).color, 1, key);
  }
});

test('covers literal colors in utility, shorthand, and SVG fixtures', () => {
  for (const source of [
    'bg-[#fff]', 'text-[rgb(1,2,3)]', 'border-[#abc]',
    'shadow-[0_0_4px_#000]',
  ]) {
    assert.equal(inspect(`@apply ${source};`).color, 1, source);
    assert.equal(inspect(`<div className="${source}" />`, false).color, 1, source);
  }
  for (const key of [
    'border', 'outline', 'border-top', 'background', '-webkit-text-fill-color',
  ]) {
    const value = key.includes('fill') ? '#fff' : '1px solid #fff';
    assert.equal(inspect(`.x { ${key}: ${value}; }`).color, 1, key);
    assert.equal(inspect(`const style = {'${key}': '${value}'}`, false).color, 1, key);
  }
  for (const key of ['fill', 'stroke']) {
    assert.equal(inspect(`<path ${key}="#fff" />`, false).color, 1, key);
    assert.equal(inspect(`<path ${key}={'#fff'} />`, false).color, 1, key);
    assert.equal(inspect(`.x { ${key}: #fff; }`).color, 1, key);
  }
  for (const css of [true, false]) {
    const value = 'color-mix(in srgb, var(--ink), #fff)';
    const source = css ? `.x { color: ${value}; }` : `const style = {color: '${value}'}`;
    assert.equal(inspect(source, css).color, 1);
  }
  for (const source of [
    '<a href="#abc" id="#x">#fff plain text</a>',
    '<path fill="url(#abc)" stroke={"url(#def)"} />',
    'const style = {fill: "url(#abc)"}',
  ]) assert.equal(inspect(source, false).color, 0, source);
  for (const source of [
    '#abc {}', '.x { fill: url(#abc); }',
    '.x { content: "#fff plain text"; }',
    '.x { background: url(#abc); }',
  ]) assert.equal(inspect(source).color, 0, source);
});

test('accepts zero resets and requires every radius length to use tokens', () => {
  for (const key of ['border-radius', 'borderRadius', 'border-top-left-radius']) {
    for (const value of ['0', '0px', 'var(--radius-element)', 'calc(var(--radius-container) - 2px)']) {
      assert.equal(inspect(`.x { ${key}: ${value}; }`).radius, 0, `${key}: ${value}`);
      assert.equal(inspect(`const style = {'${key}': '${value}'}`, false).radius, 0);
    }
    for (const value of ['var(--radius-element) 8px', '.5rem', '.5em', '8px']) {
      assert.equal(inspect(`.x { ${key}: ${value}; }`).radius, 1, `${key}: ${value}`);
      assert.equal(inspect(`const style = {'${key}': '${value}'}`, false).radius, 1);
    }
  }
  for (const value of ['0', '0px'])
    assert.equal(inspect(`<div className="rounded-[${value}]" />`, false).radius, 0);
  for (const value of ['.5rem', '.5em'])
    assert.equal(inspect(`<div className="rounded-[${value}]" />`, false).radius, 1);
});
