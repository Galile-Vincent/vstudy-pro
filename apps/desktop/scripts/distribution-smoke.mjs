/** Launch the hardened packaged executable directly and retain its report and process diagnostics. */
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout, clearTimeout } from 'node:timers';
import { finished } from 'node:stream/promises';
import { packagedExecutable, targetFor } from './release-contract.mjs';

export function validateSmokeReport(report, target) {
  if (report.schemaVersion !== 1 || !report.ok || report.exitCode !== 0 ||
      report.platform !== (target.platform === 'mac' ? 'darwin' : 'win32') || report.arch !== target.arch ||
      report.windowCreated !== true || report.rendererLoaded !== true ||
      report.database?.engine !== 'node:sqlite' || report.database?.integrity !== 'ok' ||
      report.database?.writeRead !== true || report.database?.persisted !== true ||
      report.converter?.resourcesPresent !== true || !Array.isArray(report.converter?.executables) ||
      report.converter?.bootstrapAttempted !== false || report.converter?.conversionTested !== false) {
    throw new Error(`Packaged smoke failed for ${target.key}: ${JSON.stringify(report)}`);
  }
  if (target.platform === 'win' && (report.safeStorage?.backend !== 'dpapi' || report.safeStorage?.roundTrip !== true || report.safeStorage?.ciphertextCleared !== true)) {
    throw new Error('Windows packaged smoke did not verify the native DPAPI round-trip');
  }
}

export async function runSmoke({ executable, args = [], target, output, timeoutMs = 90000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new Error('Smoke deadline must be between 100 and 300000 ms');
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(join(tmpdir(), 'vstudy-distribution-smoke-'));
  const stdout = createWriteStream(join(output, 'stdout.log'));
  const stderr = createWriteStream(join(output, 'stderr.log'));
  const env = { ...process.env, VSTUDY_DISTRIBUTION_SMOKE_DIR: root };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_RENDERER_URL', 'VSTUDY_PACKAGED_SMOKE_DIR', 'VSTUDY_FAKE_PROVIDER']) delete env[key];
  let child;
  let deadline;
  let timedOut = false;
  let outcome;
  try {
    child = spawn(executable, args, { env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    const exited = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGKILL');
    };
    const expired = new Promise((_, reject) => {
      deadline = setTimeout(() => {
        timedOut = true;
        try { kill(); } catch (error) { console.error(`Could not terminate smoke process: ${error}`); }
        reject(new Error(`Packaged smoke exceeded ${timeoutMs} ms`));
      }, timeoutMs);
    });
    outcome = await Promise.race([exited, expired]);
    await copyFile(join(root, 'smoke-result.json'), join(output, 'smoke-result.json'));
    await copyFile(join(root, 'smoke-result.json'), join(output, 'report.json'));
    await copyFile(join(root, 'window.png'), join(output, 'window.png'));
    const report = JSON.parse(await readFile(join(output, 'smoke-result.json'), 'utf8'));
    if (outcome.code !== 0) throw new Error(`Packaged application exited ${outcome.code}, signal ${outcome.signal}`);
    validateSmokeReport(report, target);
    console.log(`Packaged smoke passed for ${target.key}; converter availability was probed without download or conversion`);
    return report;
  } finally {
    clearTimeout(deadline);
    stdout.end();
    stderr.end();
    await Promise.all([finished(stdout), finished(stderr)]);
    await writeFile(join(output, 'launch.json'), JSON.stringify({ executable, target: target.key, root, timedOut, ...outcome }, null, 2) + '\n');
    if (timedOut) {
      await copyFile(join(root, 'smoke-result.json'), join(output, 'smoke-result.json')).catch(() => {});
    }
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    target: { type: 'string', default: `${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}` },
    executable: { type: 'string' }, output: { type: 'string' }, timeout: { type: 'string', default: '90000' },
  } });
  const target = targetFor(values.target);
  const output = resolve(values.output ?? join('release', 'smoke', target.key));
  await mkdir(output, { recursive: true });
  const { getCurrentFuseWire, FuseV1Options: F, FuseState } = await import('@electron/fuses');
  const executable = values.executable ? resolve(values.executable) : packagedExecutable(target, resolve('release', target.key));
  const fuses = await getCurrentFuseWire(executable);
  await writeFile(join(output, 'fuses.json'), JSON.stringify(fuses, null, 2) + '\n');
  for (const fuse of [F.RunAsNode, F.EnableNodeOptionsEnvironmentVariable, F.EnableNodeCliInspectArguments, F.GrantFileProtocolExtraPrivileges]) {
    if (fuses[fuse] !== FuseState.DISABLE) throw new Error(`Packaged fuse ${F[fuse]} must be disabled`);
  }
  for (const fuse of [F.OnlyLoadAppFromAsar, F.EnableEmbeddedAsarIntegrityValidation]) {
    if (fuses[fuse] !== FuseState.ENABLE) throw new Error(`Packaged fuse ${F[fuse]} must be enabled`);
  }
  await runSmoke({ executable, target, output, timeoutMs: Number(values.timeout) });
}
