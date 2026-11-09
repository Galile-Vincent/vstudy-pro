import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, regressions, collect, run } from './ui-lint.mjs';
test('counts unsafe declarations while accepting tokens and focus rings', async () => {
  assert.deepEqual(inspect(await readFile(new URL('./fixtures/ui-lint.css',import.meta.url),'utf8')), {shadow:1,radius:1,color:1,backdrop:1,'surface-class':1});
  assert.equal(inspect('.x { box-shadow: 0 0 0 2px var(--focus), 3px 4px black; }').shadow,1);
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
