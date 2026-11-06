/** Exercise release policy and retained artifacts with local process fixtures, without launching Electron. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { getCurrentFuseWire, FuseV1Options as F, FuseState } from '@electron/fuses';
import afterPack, { fuseTarget } from './after-pack.mjs';
import { targets, targetFor, assetNames, packagedExecutable, releaseIntent, signingMode, signingConfiguration, unsignedEnvironment } from './release-contract.mjs';
import { runSmoke, validateSmokeReport } from './distribution-smoke.mjs';
import { stageAssets, assembleAssets } from './release-assets.mjs';
import { withAppleApiKey } from './signing-key.mjs';
import { assertStaticLinkage, nativeRequirements, verifyNativeConverter } from './converter-native.mjs';

const version = '1.2.3';
const desktop = fileURLToPath(new URL('..', import.meta.url));
const repository = resolve(desktop, '../..');
const credentials = keys => Object.fromEntries(keys.split(' ').map(key => [key, `test-${key}`]));
const appleCertificate = credentials('CSC_LINK CSC_KEY_PASSWORD');
const appleApi = credentials('APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER');
const appleAccount = credentials('APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID');
const azure = credentials('AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_ENDPOINT AZURE_CODE_SIGNING_ACCOUNT AZURE_CERTIFICATE_PROFILE WIN_PUBLISHER_NAME');
const pfx = credentials('WIN_CSC_LINK WIN_CSC_KEY_PASSWORD');

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function smokeReport(target) {
  return {
    schemaVersion: 1, ok: true, exitCode: 0, appVersion: version, arch: target.arch,
    platform: target.platform === 'mac' ? 'darwin' : 'win32', windowCreated: true, rendererLoaded: true,
    database: { engine: 'node:sqlite', integrity: 'ok', writeRead: true, persisted: true },
    converter: { resourcesPresent: true, executables: [], bootstrapAttempted: false, conversionTested: false,
      managedPythonRequest: target.key === 'win-arm64' ? 'cpython-3.12-windows-x86_64' : '3.12',
      ...(target.key === 'mac-x64' ? { nativeWheel: { verified: true, sha256: 'a'.repeat(64) } } : {}),
    },
    safeStorage: target.platform === 'win' ? { backend: 'dpapi', roundTrip: true, ciphertextCleared: true } : { probed: false },
  };
}

test('only a matching stable tag can publish; branch pushes stay dry despite dry_run=false', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    for (const dryRun of [true, false]) {
      const intent = releaseIntent({ event, dryRun, ref: `refs/tags/v${version}`, version });
      assert.equal(intent.publish, event === 'push' || !dryRun);
    }
  }
  assert.equal(releaseIntent({ event: 'push', dryRun: false, ref: 'refs/heads/ci/distribution', version }).publish, false);
  assert.equal(releaseIntent({ event: 'workflow_dispatch', ref: 'refs/heads/main', version }).publish, false);
  assert.throws(() => releaseIntent({ event: 'workflow_dispatch', dryRun: false, ref: 'refs/heads/main', version }), /Release ref/);
  for (const ref of ['refs/tags/v9.9.9', 'refs/tags/v1.2.3-beta.1', 'refs/tags/v1.2']) {
    assert.throws(() => releaseIntent({ event: 'push', ref, version }), /Release ref/);
  }
});

test('Mac signing requires both a certificate and one complete notarization method', () => {
  assert.equal(signingMode('mac', {}), 'unsigned');
  assert.equal(signingMode('mac', { ...appleCertificate, ...appleApi }), 'apple-api');
  assert.equal(signingMode('mac', { ...appleCertificate, ...appleAccount }), 'apple-account');
  assert.equal(signingMode('mac', { CSC_NAME: 'installed identity', ...appleAccount }), 'apple-account');
  for (const env of [appleCertificate, appleApi, appleAccount]) assert.throws(() => signingMode('mac', env), /requires/);
  for (const group of [appleCertificate, appleApi, appleAccount]) {
    for (const key of Object.keys(group)) {
      const env = { ...appleCertificate, ...appleApi, ...appleAccount };
      delete env[key];
      assert.throws(() => signingMode('mac', env), /Incomplete/);
    }
  }
  assert.equal(signingConfiguration('mac', 'unsigned', {}).mac.notarize, false);
  assert.equal(signingConfiguration('mac', 'apple-api', {}).forceCodeSigning, true);
});

test('Windows signing has one backend and rejects every partial credential set', () => {
  assert.equal(signingMode('win', {}), 'unsigned');
  assert.equal(signingMode('win', azure), 'azure');
  assert.equal(signingMode('win', pfx), 'pfx');
  assert.equal(signingMode('win', { ...pfx, WIN_PUBLISHER_NAME: 'Configured publisher' }), 'pfx');
  assert.equal(signingMode('win', { WIN_PUBLISHER_NAME: 'Configured publisher' }), 'unsigned');
  assert.equal(signingMode('win', { WIN_SIGNTOOL_HOOK: './sign.cjs' }), 'hook');
  assert.equal(signingMode('win', { WIN_SIGNTOOL_HOOK: './sign.cjs', WIN_SIGNTOOL_CREDENTIALS: '{"token":"test-only"}' }), 'hook');
  assert.throws(() => signingMode('win', { WIN_SIGNTOOL_CREDENTIALS: '{}' }), /requires WIN_SIGNTOOL_HOOK/);
  assert.throws(() => signingMode('win', { WIN_SIGNTOOL_HOOK: './sign.cjs', WIN_SIGNTOOL_CREDENTIALS: 'invalid' }), /JSON object/);
  for (const group of [azure, pfx]) for (const key of Object.keys(group)) {
    const env = { ...group };
    delete env[key];
    assert.throws(() => signingMode('win', env), /Incomplete/);
  }
  assert.throws(() => signingMode('win', { ...azure, ...pfx }), /exactly one/);
  assert.throws(() => signingMode('win', { ...azure, WIN_CSC_LINK: 'partial' }), /Incomplete/);
  assert.equal(signingConfiguration('win', 'azure', azure).win.azureSignOptions.endpoint, azure.AZURE_ENDPOINT);
  assert.equal(signingConfiguration('win', 'hook', { WIN_SIGNTOOL_HOOK: './sign.cjs' }).win.signtoolOptions.sign, './sign.cjs');
  assert.equal(signingConfiguration('win', 'pfx', pfx).forceCodeSigning, true);
});

test('unsigned packaging strips all signing and notarization credentials', () => {
  const env = unsignedEnvironment({ ...appleCertificate, ...appleApi, ...appleAccount, ...azure, ...pfx, WIN_SIGNTOOL_HOOK: 'secret', WIN_SIGNTOOL_CREDENTIALS: 'secret', CSC_NAME: 'identity', PATH: 'keep' });
  assert.deepEqual(env, { PATH: 'keep', CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
});

test('Apple API key material is private, restored, and deleted even when signing fails', async () => {
  const pem = '-----BEGIN PRIVATE KEY-----\ntest-key-material\n-----END PRIVATE KEY-----\n';
  for (const original of [pem, Buffer.from(pem).toString('base64')]) {
    const env = { APPLE_API_KEY: original };
    let materialized;
    await assert.rejects(withAppleApiKey(env, async () => {
      materialized = env.APPLE_API_KEY;
      assert.equal(await readFile(materialized, 'utf8'), pem);
      throw new Error('signing fixture failure');
    }), /signing fixture failure/);
    assert.equal(env.APPLE_API_KEY, original);
    await assert.rejects(readFile(materialized), /ENOENT/);
  }
  await assert.rejects(withAppleApiKey({ APPLE_API_KEY: 'invalid-secret' }, () => assert.fail()), /must be a PEM/);
});

test('native converter artifacts retain upstream hashes and reject changed wheels or source locks', async t => {
  const root = await temporary(t);
  const oldHash = 'a'.repeat(64);
  const lock = `cryptography==50.0.2 \\\n    --hash=sha256:${oldHash}\n`;
  const file = 'cryptography-50.0.2-cp311-abi3-macosx_13_0_x86_64.whl';
  const wheel = Buffer.from('native-wheel-fixture');
  const sha256 = createHash('sha256').update(wheel).digest('hex');
  const overlay = nativeRequirements(lock, '50.0.2', sha256);
  assert.ok(overlay.includes(`--hash=sha256:${oldHash}`));
  assert.ok(overlay.includes(`--hash=sha256:${sha256}`));
  assert.throws(() => nativeRequirements(lock, '49.0.0', sha256), /match/);
  assert.throws(() => nativeRequirements(lock + lock, '50.0.2', sha256), /unique/);
  assert.throws(() => nativeRequirements(lock, '50.0.2', '../invalid'), /identity/);
  await mkdir(join(root, 'wheels'));
  await writeFile(join(root, 'requirements.lock.txt'), lock);
  await writeFile(join(root, 'requirements-build.lock.txt'), 'build-tools-fixture');
  await writeFile(join(root, 'requirements.native.lock.txt'), overlay);
  await writeFile(join(root, 'wheels', file), wheel);
  await writeFile(join(root, 'wheels/native.json'), JSON.stringify({ schemaVersion: 1, version: '50.0.2', file, sha256,
    sourceLockSha256: createHash('sha256').update(lock).digest('hex'),
    buildLockSha256: createHash('sha256').update('build-tools-fixture').digest('hex'),
    openssl: { sha256: '603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a' },
  }));
  assert.equal((await verifyNativeConverter(root)).file, file);
  await writeFile(join(root, 'wheels', file), 'corrupted');
  await assert.rejects(verifyNativeConverter(root), /checksum mismatch/);
  await writeFile(join(root, 'wheels', file), wheel);
  await writeFile(join(root, 'requirements.lock.txt'), lock + '# changed\n');
  await assert.rejects(verifyNativeConverter(root), /stale or invalid/);
});

test('native linkage distinguishes the Mach-O self identity from external load dependencies', () => {
  const self = '@rpath/_rust.abi3.so';
  const system = '/private/build/cryptography.so:\n\t@rpath/_rust.abi3.so (compatibility version 0.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n';
  assertStaticLinkage(system, self);
  for (const dependency of ['@rpath/libssl.3.dylib', '/usr/local/opt/openssl/libcrypto.3.dylib', '/private/build/openssl/libcrypto.3.dylib']) {
    assert.throws(() => assertStaticLinkage(system + `\t${dependency} (compatibility version 3.0.0)\n`, self), /non-system load dependency/);
  }
});

test('all native targets retain stable aliases and architecture-specific outputs', () => {
  assert.equal(targets.length, 4);
  for (const target of targets) {
    const names = assetNames(target, version);
    assert.equal(names.stable, `VStudy-Pro-${target.key}.${target.installer}`);
    assert.equal(names.archive, `VStudy-Pro-${version}-${target.key}.zip`);
    assert.match(packagedExecutable(target, '/release'), /VStudy Pro(?:\.exe)?$/);
  }
  assert.throws(() => targetFor('win-ia32'), /Unknown/);
});

test('afterPack writes hardened fuses to a Windows executable without invoking codesign', async t => {
  const root = await temporary(t);
  const context = { appOutDir: root, electronPlatformName: 'win32', packager: { appInfo: { productFilename: 'VStudy Pro' }, platformSpecificBuildOptions: {} } };
  const executable = fuseTarget(context);
  await writeFile(executable, Buffer.concat([Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1, 9]), Buffer.from('111111111')]));
  await afterPack(context);
  const fuses = await getCurrentFuseWire(executable);
  for (const fuse of [F.RunAsNode, F.EnableNodeOptionsEnvironmentVariable, F.EnableNodeCliInspectArguments, F.GrantFileProtocolExtraPrivileges]) assert.equal(fuses[fuse], FuseState.DISABLE);
  for (const fuse of [F.OnlyLoadAppFromAsar, F.EnableEmbeddedAsarIntegrityValidation]) assert.equal(fuses[fuse], FuseState.ENABLE);
  assert.equal(fuseTarget({ ...context, electronPlatformName: 'darwin' }), join(root, 'VStudy Pro.app'));
});

test('packaged smoke rejects wrong architecture, failed DB writes, and invented conversion claims', () => {
  const target = targets[0];
  validateSmokeReport(smokeReport(target), target);
  for (const patch of [{ arch: 'x64' }, { exitCode: 1 }, { windowCreated: false }, { rendererLoaded: false }, { database: { integrity: 'ok' } }, { converter: { resourcesPresent: true, conversionTested: true } }]) {
    assert.throws(() => validateSmokeReport({ ...smokeReport(target), ...patch }, target), /Packaged smoke failed/);
  }
  const win = targetFor('win-x64');
  assert.throws(() => validateSmokeReport({ ...smokeReport(win), safeStorage: { probed: false } }, win), /DPAPI/);
  const intel = targetFor('mac-x64');
  assert.throws(() => validateSmokeReport({ ...smokeReport(intel), converter: { ...smokeReport(intel).converter, nativeWheel: undefined } }, intel), /native converter wheel/);
  const arm = targetFor('win-arm64');
  assert.throws(() => validateSmokeReport({ ...smokeReport(arm), converter: { ...smokeReport(arm).converter, managedPythonRequest: '3.12' } }, arm), /x64 Python/);
});

test('native process runner retains JSON, PNG, stdout, stderr, and nonzero exit diagnostics', async t => {
  const root = await temporary(t);
  const target = targetFor(`${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}`);
  const script = join(root, 'fake-app.cjs');
  await writeFile(script, `const fs = require('node:fs'); const p = require('node:path'); const root = process.env.VSTUDY_DISTRIBUTION_SMOKE_DIR;
fs.writeFileSync(p.join(root, 'smoke-result.json'), ${JSON.stringify(JSON.stringify(smokeReport(target)))});
fs.writeFileSync(p.join(root, 'window.png'), 'fixture-png'); console.log('fixture stdout'); console.error('fixture stderr'); process.exit(Number(process.argv[2] || '0'));`);
  const output = join(root, 'pass');
  await runSmoke({ executable: process.execPath, args: [script], target, output });
  assert.equal(JSON.parse(await readFile(join(output, 'report.json'), 'utf8')).ok, true);
  assert.equal(await readFile(join(output, 'window.png'), 'utf8'), 'fixture-png');
  assert.match(await readFile(join(output, 'stderr.log'), 'utf8'), /fixture stderr/);
  const failure = join(root, 'failure');
  await assert.rejects(runSmoke({ executable: process.execPath, args: [script, '7'], target, output: failure }), /exited 7/);
  assert.equal(JSON.parse(await readFile(join(failure, 'launch.json'), 'utf8')).code, 7);
  const hung = join(root, 'hung.cjs');
  await writeFile(hung, 'setInterval(() => {}, 1000);');
  await assert.rejects(runSmoke({ executable: process.execPath, args: [hung], target, output: join(root, 'timeout'), timeoutMs: 200 }), /exceeded/);
  assert.equal(JSON.parse(await readFile(join(root, 'timeout/launch.json'), 'utf8')).timedOut, true);
});

test('all four staged artifacts assemble with correct update hashes, stable aliases, checksums, and unsigned notes', async t => {
  const root = await temporary(t);
  for (const target of targets) {
    const input = join(root, 'packaged', target.key);
    const smoke = join(root, 'smoke', target.key);
    await mkdir(input, { recursive: true });
    await mkdir(smoke, { recursive: true });
    const names = assetNames(target, version);
    await writeFile(join(input, names.installer), `installer-${target.key}`);
    await writeFile(join(input, names.archive), `archive-${target.key}`);
    const updateName = target.platform === 'mac' ? names.archive : names.installer;
    const sha512 = createHash('sha512').update(await readFile(join(input, updateName))).digest('base64');
    await writeFile(join(input, target.platform === 'mac' ? 'latest-mac.yml' : 'latest.yml'), JSON.stringify({ version, path: updateName, sha512, files: [{ url: updateName, sha512 }] }));
    await writeFile(join(input, 'signing.json'), JSON.stringify({ schemaVersion: 1, target: target.key, mode: 'unsigned', signed: false, notarized: false }));
    await writeFile(join(smoke, 'smoke-result.json'), JSON.stringify(smokeReport(target)));
    if (target.platform === 'win') await writeFile(join(smoke, 'installer-smoke.json'), JSON.stringify({
      schemaVersion: 1, target: target.key, ok: true, administrator: false, installed: true, launched: true, startMenu: true, uninstalled: true,
    }));
    const output = join(root, 'artifacts', `distribution-${target.key}-unsigned`);
    await stageAssets({ target, version, input, smoke, output, env: {} });
    if (target.platform === 'win') {
      const installation = JSON.parse(await readFile(join(smoke, 'installer-smoke.json'), 'utf8'));
      await writeFile(join(smoke, 'installer-smoke.json'), JSON.stringify({ ...installation, administrator: true }));
      await assert.rejects(stageAssets({ target, version, input, smoke, output: join(root, 'rejected', target.key), env: {} }), /non-admin/);
      await writeFile(join(smoke, 'installer-smoke.json'), JSON.stringify(installation));
    }
    assert.deepEqual(await readFile(join(output, names.stable)), await readFile(join(output, names.installer)));
    const metadata = JSON.parse(await readFile(join(output, `latest-${target.key}.yml`), 'utf8'));
    const update = await readFile(join(output, metadata.path));
    assert.equal(metadata.sha512, createHash('sha512').update(update).digest('base64'));
  }
  const notes = join(root, 'notes.md');
  await writeFile(notes, '# Release 1.2.3\n\nStudent release.');
  const output = join(root, 'release');
  const result = await assembleAssets({ version, input: join(root, 'artifacts'), output, notes });
  assert.match(result, /Student release/);
  assert.match(result, /Unsigned/);
  assert.match(result, /do not download dependencies/);
  assert.equal(JSON.parse(await readFile(join(output, 'distribution-manifest.json'), 'utf8')).builds.length, 4);
  const sums = await readFile(join(output, 'SHA256SUMS.txt'), 'utf8');
  for (const line of sums.trim().split('\n')) {
    const [hash, file] = line.split('  ');
    assert.equal(createHash('sha256').update(await readFile(join(output, file))).digest('hex'), hash);
  }
  const target = targets[0];
  await writeFile(join(root, 'artifacts', `distribution-${target.key}-unsigned`, assetNames(target, version).stable), 'corrupted');
  await assert.rejects(assembleAssets({ version, input: join(root, 'artifacts'), output: join(root, 'corrupt'), notes }), /Checksum mismatch/);
});

test('workflow exposes no signing credentials to branch or dry-run steps, and every action is SHA-pinned', async () => {
  const workflow = await readFile(join(repository, '.github/workflows/release.yml'), 'utf8');
  for (const line of workflow.split('\n')) if (line.includes('secrets.')) {
    assert.match(line, /needs\.plan\.outputs\.publish == 'true' && matrix\.platform == '(mac|win)' && secrets\./);
  }
  const unsigned = workflow.split('- name: Package unsigned')[1].split('- name: Package release')[0];
  assert.doesNotMatch(unsigned, /secrets\.|CSC_|AZURE_|APPLE_|WIN_SIGN/);
  assert.match(unsigned, /--unsigned/);
  for (const file of ['ci.yml', 'release.yml']) {
    const contents = await readFile(join(repository, '.github/workflows', file), 'utf8');
    for (const line of contents.split('\n')) if (line.includes('uses:')) assert.match(line, /@[a-f0-9]{40}\b/);
  }
});

test('branch release planning cannot become publishable from dry_run=false', async t => {
  const root = await temporary(t);
  const output = join(root, 'outputs');
  const result = spawnSync(process.execPath, ['apps/desktop/scripts/release-plan.mjs'], {
    cwd: repository, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/ci/distribution', RELEASE_DRY_RUN: 'false', GITHUB_OUTPUT: output },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, 'utf8'), /publish=false/);
  const matrix = (await readFile(output, 'utf8')).split('\n').find(line => line.startsWith('matrix=')).slice('matrix='.length);
  assert.equal(JSON.parse(matrix).include.length, 4);
  assert.deepEqual((await readdir(root)), ['outputs']);
});

test('the publisher refuses branches and dry runs before invoking GitHub', async () => {
  const packageVersion = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8')).version;
  for (const [event, ref, dryRun] of [
    ['push', 'refs/heads/ci/distribution', 'false'],
    ['workflow_dispatch', `refs/tags/v${packageVersion}`, 'true'],
  ]) {
    const result = spawnSync(process.execPath, ['apps/desktop/scripts/release-publish.mjs'], {
      cwd: repository, encoding: 'utf8', env: { PATH: '', GITHUB_EVENT_NAME: event, GITHUB_REF: ref, RELEASE_DRY_RUN: dryRun },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release publication is prohibited for branch pushes and dry runs/);
  }
});
