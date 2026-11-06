/** Verify the actual ASAR/native PTY package with release fuses enabled and isolated smoke data. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, copyFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { getCurrentFuseWire, FuseV1Options as F } from '@electron/fuses';

const evidence = resolve('../../docs/evidence/ai-cli/packaged');
await mkdir(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'vstudy-packaged-smoke-'));
const bundle = resolve('release/mac-arm64/VStudy Pro.app');
const native = join(bundle, 'Contents/Resources/app.asar.unpacked/node_modules/node-pty');
const helperModes = new Map();
let child;
try {
  for (const directory of ['build/Release', 'build/Debug', 'prebuilds/darwin-arm64']) {
    const helper = join(native, directory, 'spawn-helper');
    const info = await stat(helper).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (info) { helperModes.set(helper, info.mode & 0o777); await chmod(helper, 0o644); }
  }
  assert.ok(helperModes.size, 'a packaged native helper exists');
  const signature = execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { encoding: 'utf8' });
  const fuses = await getCurrentFuseWire(bundle);
  assert.equal(fuses[F.RunAsNode], 48); assert.equal(fuses[F.EnableNodeCliInspectArguments], 48);
  assert.equal(fuses[F.OnlyLoadAppFromAsar], 49); assert.equal(fuses[F.EnableEmbeddedAsarIntegrityValidation], 49);
  const nativeFiles = {};
  for (const file of ['prebuilds/darwin-arm64/pty.node', 'prebuilds/darwin-arm64/spawn-helper']) nativeFiles[file] = (await stat(join(native, file))).size;
  let log = '';
  child = spawn(join(bundle, 'Contents/MacOS/VStudy Pro'), [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_PACKAGED_SMOKE_DIR: root, VSTUDY_FAKE_PROVIDER: '1', VSTUDY_CLI_PTY_SMOKE: '1', VSTUDY_LOCALE: 'en' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log = (log + data).slice(-32768); });
  child.stderr.on('data', data => { log = (log + data).slice(-32768); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 40000);
  const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
  const result = JSON.parse(await readFile(join(root, 'smoke-result.json'), 'utf8'));
  const helpers = await Promise.all([...helperModes.keys()].map(async path => ({ path: path.slice(native.length + 1), before: '644', after: ((await stat(path)).mode & 0o777).toString(8) })));
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ code, signatureVerified: true, signature, fuses, nativeFiles, helpers, result }, null, 2));
  await writeFile(join(evidence, 'launch.log'), log);
  await copyFile(join(root, 'ai-cli-packaged.png'), join(evidence, 'ai-cli-packaged.png')).catch(() => {});
  assert.equal(code, 0); assert.equal(result.ok, true); assert.equal(result.nativeCommandAnswered, true); assert.equal(result.closed, true);
  assert.ok(helpers.some(helper => (parseInt(helper.after, 8) & 0o111) === 0o111), 'the real ASAR runtime repaired its resolved helper before the PTY spawn');
  console.log(JSON.stringify({ ...result, signatureVerified: true, releaseFusesEnabled: true, nativeFiles }));
} finally {
  child?.kill('SIGKILL');
  for (const [path, mode] of helperModes) await chmod(path, mode);
  await rm(root, { recursive: true, force: true });
}
