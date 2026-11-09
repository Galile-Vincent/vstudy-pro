import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { siteRelease } from './update-site-release.mjs';
import { parseRelease } from '../apps/website/src/data/release.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/site-release.json', import.meta.url), 'utf8'));
test('published stable assets supply exact bytes and version', () => {
  assert.deepEqual(siteRelease(fixture), {
    version: '0.3.0', publishedAt: '2026-11-06T08:50:42.000Z',
    assets: { 'mac-arm64': { bytes: 123600629 }, 'win-x64': { bytes: 111704642 } },
  });
});
test('draft, prerelease, and unknown publication state are rejected', () => {
  for (const changes of [{ isDraft: true }, { isDraft: undefined }, { isPrerelease: true }]) {
    assert.throws(() => siteRelease({ ...fixture, ...changes }), /published stable/);
  }
});
test('missing, duplicate, incomplete, and invalid assets are rejected', () => {
  for (const assets of [fixture.assets.slice(1), [...fixture.assets, fixture.assets[0]], fixture.assets.map(a => ({ ...a, size: 0 })), fixture.assets.map(a => ({ ...a, state: 'new' }))]) {
    assert.throws(() => siteRelease({ ...fixture, assets }), /published asset/);
  }
});
test('publication date normalizes to UTC across the date boundary', () => {
  assert.equal(siteRelease({ ...fixture, publishedAt: '2026-11-07T00:50:42+08:00' }).publishedAt, '2026-11-06T16:50:42.000Z');
  for (const publishedAt of [null, '', 'yesterday', '2026-11-06', '2026-02-30T00:00:00Z']) assert.throws(() => siteRelease({ ...fixture, publishedAt }), /publication date/);
});
test('site hides all metadata when the snapshot is missing or invalid', () => {
  const valid = siteRelease(fixture);
  assert.deepEqual(parseRelease(JSON.stringify(valid)), valid);
  for (const value of [undefined, '{', 'null', '{}', JSON.stringify({ ...valid, publishedAt: 'bad' }), JSON.stringify({ ...valid, assets: {} })]) assert.equal(parseRelease(value), undefined);
});
