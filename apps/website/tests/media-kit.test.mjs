import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMediaKit, website } from '../scripts/make-media-kit.mjs';
import sharp from 'sharp';
test('brand exports regenerate matching SVGs and PNG pixels, including committed assets',async () => {
  const a = await mkdtemp(join(tmpdir(),'vstudy-media-a-'));
  const b = await mkdtemp(join(tmpdir(),'vstudy-media-b-'));
  try {
    await makeMediaKit(a);
    await makeMediaKit(b);
    const files = await readdir(a);
    assert.equal(files.length,10);
    for (const file of files) {
      const bytes = await readFile(join(a,file));
      for (const target of [join(b,file),join(website,'public/brand/kit',file)]) {
        const actual = await readFile(target);
        if (file.endsWith('.png')) {
          const expectedPixels = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
          const actualPixels = await sharp(actual).ensureAlpha().raw().toBuffer({resolveWithObject:true});
          assert.deepEqual(actualPixels.info,expectedPixels.info,file);
          for (let i = 0; i < expectedPixels.data.length; i++) {
            assert.ok(Math.abs(actualPixels.data[i]-expectedPixels.data[i]) <= 1,`${file} pixel byte ${i}`);
          }
        } else assert.deepEqual(actual,bytes,file);
      }
    }
  } finally { await rm(a,{recursive:true}); await rm(b,{recursive:true}); }
});
