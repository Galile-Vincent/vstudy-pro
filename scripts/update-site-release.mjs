import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function siteRelease(release) {
  if (release?.isDraft !== false || release.isPrerelease !== false) throw new Error('Expected a published stable release');
  if (!/^v\d+\.\d+\.\d+$/.test(release.tagName)) throw new Error('Invalid release tag');
  if (typeof release.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(release.publishedAt) || !Number.isFinite(Date.parse(release.publishedAt))) throw new Error('Invalid publication date');
  const calendarDate = release.publishedAt.slice(0, 10);
  if (new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate) throw new Error('Invalid publication date');
  const assets = {};
  for (const [key, extension] of [['mac-arm64', 'dmg'], ['win-x64', 'exe']]) {
    const name = `VStudy-Pro-${key}.${extension}`;
    const matches = release.assets?.filter(asset => asset.name === name) ?? [];
    if (matches.length !== 1 || matches[0].state !== 'uploaded' || !Number.isSafeInteger(matches[0].size) || matches[0].size <= 0) throw new Error(`Missing or invalid published asset ${name}`);
    assets[key] = { bytes: matches[0].size };
  }
  return { version: release.tagName.slice(1), publishedAt: new Date(release.publishedAt).toISOString(), assets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tag = process.argv[2];
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('Usage: node scripts/update-site-release.mjs vX.Y.Z [release JSON fixture]');
  const source = process.argv[3] ? await readFile(process.argv[3], 'utf8')
    : execFileSync('gh', ['release', 'view', tag, '--repo', 'ava-apple/vstudy-pro', '--json', 'tagName,publishedAt,assets,isDraft,isPrerelease'], { encoding: 'utf8' });
  const release = JSON.parse(source);
  if (release.tagName !== tag) throw new Error('Release tag does not match requested tag');
  const data = siteRelease(release);
  await writeFile(new URL('../apps/website/src/data/release.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated website release to ${data.version}, published ${data.publishedAt}`);
}
