import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMediaKit, website } from '../scripts/make-media-kit.mjs';
import sharp from 'sharp';
test('brand exports regenerate byte for byte, including committed assets',async () => {
  const a = await mkdtemp(join(tmpdir(),'vstudy-media-a-'));
  const b = await mkdtemp(join(tmpdir(),'vstudy-media-b-'));
  try {
    await makeMediaKit(a);
    await makeMediaKit(b);
    const files = await readdir(a);
    assert.equal(files.length,10);
    for (const file of files) {
      const bytes = await readFile(join(a,file));
      assert.deepEqual(bytes,await readFile(join(b,file)),file);
      assert.deepEqual(bytes,await readFile(join(website,'public/brand/kit',file)),file);
      if (file.endsWith('.png')) assert.equal((await sharp(bytes).metadata()).format,'png');
    }
  } finally { await rm(a,{recursive:true}); await rm(b,{recursive:true}); }
});
