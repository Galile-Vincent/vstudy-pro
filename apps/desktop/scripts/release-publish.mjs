/** Publish only an actual stable tag and verify the public latest-download installer URLs. */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { releaseIntent, targets, targetsFor, assetNames } from './release-contract.mjs';

const { fetch, AbortSignal } = globalThis;

const version = JSON.parse(await readFile('apps/desktop/package.json', 'utf8')).version;
const intent = releaseIntent({ event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF ?? '',
  dryRun: process.env.RELEASE_DRY_RUN !== 'false', version });
if (!intent.publish) throw new Error('Release publication is prohibited for branch pushes and dry runs');
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
const assets = (await readdir('release-assets')).sort().map(file => join('release-assets', file));
const manifest = JSON.parse(await readFile('release-assets/distribution-manifest.json', 'utf8'));
const expected = targetsFor('release').map(target => target.key).sort();
if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.scope !== 'release' ||
    JSON.stringify(manifest.builds.map(build => build.target).sort()) !== JSON.stringify(expected) ||
    targets.filter(target => !target.releaseEnabled).some(target => assets.some(file => file.includes(`-${target.key}.`)))) {
  throw new Error('Release assets must contain exactly the enabled publication targets');
}
execFileSync('gh', ['release', 'create', intent.tag, '--repo', repository, '--verify-tag', '--latest', '--title', `VStudy Pro ${version}`, '--notes-file', 'release-notes.md', ...assets], { stdio: 'inherit' });
for (const target of targetsFor('release')) {
  const url = `https://github.com/${repository}/releases/latest/download/${assetNames(target, version).stable}`;
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    await response.body?.cancel();
    if (response.status === 200) { verified = true; break; }
    if (attempt < 5) await setTimeout(5000);
  }
  if (!verified) throw new Error(`Stable download did not return HTTP 200: ${url}`);
  console.log(`HTTP 200 ${url}`);
}
