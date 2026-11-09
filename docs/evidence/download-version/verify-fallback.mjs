import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';

const snapshot = new URL('../../../apps/website/src/data/release.json', import.meta.url);
const original = await readFile(snapshot);
try {
  for (const state of ['missing', 'invalid']) {
    if (state === 'missing') await unlink(snapshot);
    else await writeFile(snapshot, '{invalid');
    execFileSync('pnpm', ['--filter', '@vstudy/website', 'build'], { stdio: 'pipe' });
    for (const locale of ['en', 'zh-Hant', 'ja']) {
      const html = await readFile(new URL(`../../../apps/website/dist/${locale}/download/index.html`, import.meta.url), 'utf8');
      assert.doesNotMatch(html, /class="dl-release"|\d+(?:\.\d+)? MB/);
      assert.ok(html.includes('releases/latest/download/VStudy-Pro-mac-arm64.dmg'));
    }
    console.log(`PASS. ${state} snapshot builds with hidden metadata in all three languages.`);
  }
} finally {
  await writeFile(snapshot, original);
  execFileSync('pnpm', ['--filter', '@vstudy/website', 'build'], { stdio: 'pipe' });
}
