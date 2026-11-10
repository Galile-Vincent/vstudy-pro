/** Stage architecture-specific release assets and assemble a complete, checksum-verified release. */
import {parseFeed} from '../src/main/updates/validate.mjs';
import { parseUpdateInfo } from 'electron-updater/out/providers/Provider.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assetNames, releaseVersion, targetFor, targetsFor } from './release-contract.mjs';
import { validateSmokeReport } from './distribution-smoke.mjs';

async function digest(path, algorithm, encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest(encoding);
}

async function inventory(directory) {
  const files = (await readdir(directory)).sort();
  return Promise.all(files.map(async file => ({ file, size: (await stat(join(directory, file))).size, sha256: await digest(join(directory, file), 'sha256') })));
}

async function writeJson(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }

export async function stageAssets({ target, version, input, smoke, output, env = process.env }) {
  releaseVersion(version);
  const signing = JSON.parse(await readFile(join(input, 'signing.json'), 'utf8'));
  const report = JSON.parse(await readFile(join(smoke, 'smoke-result.json'), 'utf8'));
  validateSmokeReport(report, target);
  let installation;
  let mcpEnabledSmoke;
  if (target.platform === 'win') {
    installation = JSON.parse(await readFile(join(smoke, 'installer-smoke.json'), 'utf8'));
    if (installation.schemaVersion !== 1 || installation.target !== target.key || installation.ok !== true ||
        installation.administrator !== false || installation.installed !== true || installation.launched !== true ||
        installation.startMenu !== true || installation.uninstalled !== true || installation.protocolRegistered !== true || installation.mcpStartup?.disabled !== true ||
        installation.mcpStartup?.enabled !== true) throw new Error('Windows installer smoke did not verify non-admin install, MCP-off/on launch, Start menu, and uninstall');
    mcpEnabledSmoke = JSON.parse(await readFile(join(smoke, 'mcp-enabled', 'smoke-result.json'), 'utf8'));
    validateSmokeReport(mcpEnabledSmoke, target, true);
    if (mcpEnabledSmoke.appVersion !== version) throw new Error('MCP-enabled smoke version does not match the release version');
  }
  if (report.appVersion !== version) throw new Error('Smoke version does not match the release version');
  if (signing.target !== target.key || signing.schemaVersion !== 1 || typeof signing.signed !== 'boolean' ||
      signing.signed !== (signing.mode !== 'unsigned')) throw new Error('Invalid signing provenance');
  const names = assetNames(target, version);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Asset staging directory must be empty');
  for (const name of [names.installer, names.archive]) await copyFile(join(input, name), join(output, name));
  await copyFile(join(output, names.installer), join(output, names.stable));
  for (const file of await readdir(input)) if (file.startsWith(`VStudy-Pro-${version}-${target.key}.`) && file.endsWith('.blockmap')) {
    await copyFile(join(input, file), join(output, file));
  }
  const date = new Date().toISOString();
  const metadata = target.platform === 'mac' ? 'latest-mac.yml' : 'latest.yml';
  const raw = await readFile(join(input,metadata),'utf8');
  if (raw.length > 65536 || /[&*!]/.test(raw)) throw new Error('Unsafe update metadata');
  const feed = parseUpdateInfo(raw,metadata,new URL('https://github.com/'));
  if (feed.version !== version || !Array.isArray(feed.files) || !feed.files.length) throw new Error('Invalid update metadata');
  for (const file of feed.files) {
    if (![names.installer,names.archive].includes(file.url) ||
      file.sha512 !== await digest(join(output,file.url),'sha512','base64') ||
      file.size !== (await stat(join(output,file.url))).size) throw new Error('Invalid update metadata');
  }
  const payload = target.platform === 'mac' ? names.archive : names.installer;
  const selected = feed.files.find(file=>file.url === payload);
  if (!selected) throw new Error('Missing update payload');
  const content = JSON.stringify({version,path:payload,sha512:selected.sha512,
    releaseDate:typeof feed.releaseDate === 'string' ? feed.releaseDate : date,
    files:[{url:payload,sha512:selected.sha512,size:selected.size}]},null,2) + '\n';
  await writeFile(join(output,`latest-${target.key}.yml`),content);
  if (target.key === 'mac-arm64' || target.key === 'win-x64') await writeFile(join(output,metadata),content);
  const label = signing.signed ? 'signed' : 'unsigned';
  const provenance = {
    schemaVersion: 1, version, target: target.key, platform: target.platform, arch: target.arch, signing,
    source: { repository: env.GITHUB_REPOSITORY ?? null, commit: env.GITHUB_SHA ?? null, ref: env.GITHUB_REF ?? null,
      run: env.GITHUB_RUN_ID ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null },
    builtAt: date, smoke: report, ...(installation ? { installation, mcpEnabledSmoke } : {}), assets: await inventory(output),
  };
  await writeJson(join(output, `VStudy-Pro-${version}-${target.key}.provenance.json`), provenance);
  await writeFile(join(output, `VStudy-Pro-${version}-${target.key}.build-notes.txt`),
    `${target.key} ${version}: ${label}, mode ${signing.mode}.\n${signing.notarized ? 'Mac notarization completed.' : 'No Mac notarization claim for this target.'}\nPackaged window, renderer, and native node:sqlite durability smoke passed.\nConverter resources and existing executable availability were probed. No converter download or conversion was performed.\nIn-app updates require a supported installation; see docs/UPDATES.md.\n`);
  const assets = await inventory(output);
  await writeJson(join(output, `target-${target.key}.json`), { schemaVersion: 1, version, target: target.key, signing, assets });
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `label=${label}\n`);
  return provenance;
}

export async function assembleAssets({ version, input, output, notes, scope = 'release' }) {
  releaseVersion(version);
  const targets = targetsFor(scope);
  const artifactDirectories = await readdir(input);
  for (const directory of artifactDirectories) {
    if (!targets.some(target => [target.key, `distribution-${target.key}-signed`, `distribution-${target.key}-unsigned`].includes(directory))) {
      throw new Error(`Unexpected target artifact in ${scope} scope: ${directory}`);
    }
  }
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Release assembly directory must be empty');
  const builds = [];
  for (const target of targets) {
    const directories = artifactDirectories.filter(name => [target.key, `distribution-${target.key}-signed`, `distribution-${target.key}-unsigned`].includes(name));
    if (directories.length !== 1) throw new Error(`Expected exactly one artifact directory for ${target.key}`);
    const directory = join(input, directories[0]);
    const manifestFile = `target-${target.key}.json`;
    const manifest = JSON.parse(await readFile(join(directory, manifestFile), 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.target !== target.key) throw new Error(`Invalid manifest for ${target.key}`);
    const actualFiles = (await readdir(directory)).sort();
    const expectedFiles = [...manifest.assets.map(asset => asset.file), manifestFile].sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error(`Unexpected release files for ${target.key}`);
    for (const asset of manifest.assets) {
      if (basename(asset.file) !== asset.file || asset.file.includes('\\') || !/^[\w.-]+$/.test(asset.file)) throw new Error('Unsafe release asset name');
      const path = join(directory, asset.file);
      if ((await stat(path)).size !== asset.size || await digest(path, 'sha256') !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.file}`);
    }
    for (const file of actualFiles) await copyFile(join(directory, file), join(output, file));
    builds.push(manifest);
  }
  for (const target of targets) {
    const names = assetNames(target, version);
    const metadata = `latest-${target.key}.yml`;
    const payload = target.platform === 'mac' ? names.archive : names.installer;
    for (const file of [metadata, ...(target.key === 'mac-arm64' ? ['latest-mac.yml'] : target.key === 'win-x64' ? ['latest.yml'] : []), names.archive, payload, `${payload}.blockmap`]) {
      if (!(await stat(join(output, file))).size) throw new Error(`Missing update asset: ${file}`);
    }
    const feed = await readFile(join(output, metadata), 'utf8');
    const info = parseFeed(feed, payload.slice(`VStudy-Pro-${version}-`.length));
    const hash = await digest(join(output,payload),'sha512','base64');
    const size = (await stat(join(output,payload))).size;
    if (info.version !== version || info.path !== payload || info.sha512 !== hash ||
      !Array.isArray(info.files) || !info.files.length || info.files.some(file =>
        file.url !== payload || file.sha512 !== hash || file.size !== size)) {
      throw new Error(`Invalid update metadata for ${payload}`);
    }
    const alias = target.key === 'mac-arm64' ? 'latest-mac.yml' : target.key === 'win-x64' ? 'latest.yml' : null;
    if (alias && await readFile(join(output,alias),'utf8') !== feed) throw new Error(`Mismatched alias ${alias}`);
  }
  await writeJson(join(output, 'distribution-manifest.json'), { schemaVersion: 1, version, scope, builds });
  const assets = await inventory(output);
  await writeFile(join(output, 'SHA256SUMS.txt'), assets.map(asset => `${asset.sha256}  ${asset.file}\n`).join(''));
  const releaseNotes = await readFile(notes, 'utf8');
  const statuses = builds.map(build => `| ${build.target} | ${build.signing.signed ? 'Signed' : 'Unsigned'} | ${build.signing.mode} | Passed |`).join('\n');
  return `${releaseNotes.trim()}\n\n## Build verification\n\n| Target | Signing | Mode | Packaged smoke |\n| --- | --- | --- | --- |\n${statuses}\n\nUnsigned artifacts have no trusted publisher signature. Mac unsigned bundles use an ad-hoc signature and are not notarized. Stable installer filenames are identical across signing modes.\n\nSmoke launches the packaged application, creates a window, mounts the renderer, and checks native node:sqlite integrity and durable writes. Converter checks only probe bundled resources and existing executables. They do not download dependencies or establish conversion support. In-app updates require a supported installation; see docs/UPDATES.md.\n\nSee SHA256SUMS.txt and the per-target provenance files for asset integrity and build details.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    target: { type: 'string' }, version: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' }, smoke: { type: 'string' }, notes: { type: 'string' }, scope: { type: 'string' },
  } });
  const version = values.version ?? JSON.parse(await readFile('apps/desktop/package.json', 'utf8')).version;
  if (positionals[0] === 'stage') {
    const target = targetFor(values.target);
    await stageAssets({ target, version, input: values.input ?? `apps/desktop/release/${target.key}`,
      smoke: values.smoke ?? `apps/desktop/release/smoke/${target.key}`, output: values.output ?? `artifacts/${target.key}` });
  } else if (positionals[0] === 'assemble') {
    const notes = await assembleAssets({ version, input: values.input ?? 'artifacts', output: values.output ?? 'release-assets', notes: values.notes ?? `docs/releases/${version}.md`, scope: values.scope ?? 'release' });
    await writeFile('release-notes.md', notes);
  } else throw new Error('Use release-assets.mjs stage or assemble');
}
