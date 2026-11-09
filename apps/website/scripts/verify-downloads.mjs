/** Verify detection outcomes and the generated no-JavaScript download contract. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { downloadBase as latestDownloadBase, installers, recommendedInstaller, releaseMetadata } from '../src/data/downloads.ts';

import { parseRelease } from '../src/data/release.ts';
const release = parseRelease(await readFile(new URL('../src/data/release.json', import.meta.url), 'utf8').catch(() => undefined));
const downloadBase = release ? `https://github.com/ava-apple/vstudy-pro/releases/download/v${release.version}` : latestDownloadBase;
const cases = [
  ['Windows x64 UA', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', {}, 'win-x64'],
  ['Windows ambiguous', 'Windows NT 10.0', {}, 'win-x64'],
  ['Windows ARM64 UA', 'Windows NT 10.0; ARM64', {}, 'win-arm64'],
  ['Windows AArch64 UA', 'Windows NT 10.0; aarch64', {}, 'win-arm64'],
  ['Windows ARM64 hints', 'Windows NT 10.0; Win64; x64', { platform: 'Windows', architecture: 'arm', bitness: '64' }, 'win-arm64'],
  ['Windows explicit ARM64', '', { platform: 'Windows', architecture: 'arm64' }, 'win-arm64'],
  ['Windows ARM without bitness', '', { platform: 'Windows', architecture: 'arm' }, 'win-x64'],
  ['Windows x64 hints', '', { platform: 'Windows', architecture: 'x86', bitness: '64' }, 'win-x64'],
  ['Safari ambiguous Intel UA', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', {}, 'mac-arm64'],
  ['Mac Apple silicon hints', 'Macintosh', { platform: 'macOS', architecture: 'arm', bitness: '64' }, 'mac-arm64'],
  ['Mac Intel hints', 'Macintosh', { platform: 'macOS', architecture: 'x86', bitness: '64' }, 'mac-x64'],
  ['Mac incomplete hints', 'Macintosh', { platform: 'macOS', architecture: 'x86' }, 'mac-arm64'],
  ['Linux', 'X11; Linux x86_64', {}, undefined],
  ['iPhone with Mac token', 'iPhone; CPU iPhone OS like Mac OS X', {}, undefined],
  ['iPad', 'iPad; CPU OS like Mac OS X', {}, undefined],
  ['Android', 'Linux; Android 14; arm64', {}, undefined],
  ['unknown', '', {}, undefined],
];
for (const [name, ua, hints, expected] of cases) {
  assert.equal(recommendedInstaller(ua, hints), expected, name);
}
assert.equal(new Set(installers.map(item => item.file)).size, 4);
assert.deepEqual(releaseMetadata(undefined), {}, 'Unverified release metadata must remain hidden');
const downloadRoutes = ['en/download/', 'zh-Hant/download/', 'ja/download/'];
for (const route of downloadRoutes) {
  const html = await readFile(new URL(`../dist/${route}index.html`, import.meta.url), 'utf8');
  for (const installer of installers) {
    const linked = html.includes(`href="${downloadBase}/${installer.file}"`);
    assert.equal(linked, installer.releaseEnabled, `${route} no-JS publication scope ${installer.id}`);
    assert.equal(html.includes(`data-installer="${installer.id}"`), installer.releaseEnabled, `${route} shows enabled cards`);
  }
  assert.ok(html.includes(`href="${downloadBase}/SHA256SUMS.txt"`), `${route} checksums`);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const details = [...main.matchAll(/<details\b([^>]*)>/g)];
  assert.equal(details.length, 6, `${route} has six help sections`);
  assert.ok(details.every(match => !/\sopen(?:[=\s]|$)/.test(match[1])), `${route} help starts closed`);
  assert.ok(main.indexOf('class="dl-cards"') < main.indexOf('<details'), `${route} cards come before help`);
  assert.deepEqual(details.map(match => match[1].match(/id="([^"]+)"/)[1]), [
    'mac-first-open', 'dl-script', 'dl-agent', 'windows-smartscreen',
    'verify-download', 'update-uninstall',
  ], `${route} help order`);
  if (release) {
    assert.ok(html.includes(`<time datetime="${release.publishedAt}"`), `${route} publication timestamp`);
    for (const asset of Object.values(release.assets)) assert.ok(html.includes(`${(asset.bytes / 1_000_000).toFixed(1)} MB`), `${route} verified size`);
  } else assert.doesNotMatch(html, /\d+(?:\.\d+)?\s*(?:MB|MiB)\b/, 'No invented installer size');
}
/* Every other page points at the download page and carries no installer links of its own. */
for (const route of ['', 'en/', 'zh-Hant/', 'ja/', 'en/docs/getting-started/', 'zh-Hant/docs/getting-started/', 'ja/docs/getting-started/']) {
  const html = await readFile(new URL(`../dist/${route}index.html`, import.meta.url), 'utf8');
  const lang = route.split('/')[0] || 'en';
  assert.ok(html.includes(`href="/${lang}/download/"`), `${route} links to the download page`);
  for (const installer of installers) assert.ok(!html.includes(`${downloadBase}/${installer.file}`), `${route} must not link installers directly`);
}
console.log(`PASS: ${cases.length} platform cases; three download pages link enabled installers and checksums; homepages and guides link to the download page.`);
