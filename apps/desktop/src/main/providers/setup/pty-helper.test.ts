/** Missing execute bits recover without changing helper bytes or escaping the dependency package. @packageDocumentation */
import { chmodSync, copyFileSync, existsSync, fchmodSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { i18n, tr } from '../../../shared/i18n';
import { ActionPty, type PtySpawn } from './pty';
import { repairPtyHelper, repairPtyHelpers } from './pty-helper.mjs';
import { temporaryDirectories } from './test-fixtures';

const temporary = temporaryDirectories();
const realPackage = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
const original = ['build/Release/spawn-helper', `prebuilds/${process.platform}-${process.arch}/spawn-helper`, 'prebuilds/darwin-arm64/spawn-helper'].map(path => join(realPackage, path)).find(existsSync)!;
const mode = (path: string) => statSync(path).mode & 0o777;
async function fixture(directory = 'prebuilds/darwin-arm64', archive?: string) {
  const temporaryRoot = join(await temporary(), "copy with spaces and 'quotes'");
  const root = archive ? join(temporaryRoot, archive + '.unpacked', 'node_modules', 'node-pty') : join(temporaryRoot, 'node-pty');
  const helper = join(root, directory, 'spawn-helper');
  mkdirSync(dirname(helper), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'node-pty', version: '1.1.0' }));
  copyFileSync(original, helper); chmodSync(helper, 0o644);
  return { root, helper, manifest: archive ? join(temporaryRoot, archive, 'node_modules', 'node-pty', 'package.json') : join(root, 'package.json') };
}

it.skipIf(process.platform === 'win32').each(['build/Release', 'build/Debug', 'prebuilds/darwin-arm64', 'prebuilds/darwin-x64', 'prebuilds/linux-arm64', 'prebuilds/linux-x64'])('repairs the copied 0644 helper in %s once without modifying its bytes', async directory => {
  const { helper, manifest } = await fixture(directory), bytes = readFileSync(helper), changeMode = vi.fn(fchmodSync);
  expect(repairPtyHelper(manifest, directory, changeMode)).toBe(true);
  expect(mode(helper)).toBe(0o755); expect(readFileSync(helper)).toEqual(bytes);
  const after = statSync(helper);
  expect(repairPtyHelper(manifest, directory, changeMode)).toBe(false);
  expect(changeMode).toHaveBeenCalledTimes(1);
  expect(statSync(helper).ctimeMs).toBe(after.ctimeMs);
});

it.skipIf(process.platform === 'win32')('prepares both Darwin prebuilds and leaves ready CI artifacts untouched', async () => {
  const { root, helper, manifest } = await fixture();
  const other = join(root, 'prebuilds/darwin-x64/spawn-helper');
  mkdirSync(dirname(other), { recursive: true }); copyFileSync(helper, other); chmodSync(other, 0o644);
  expect(repairPtyHelpers(manifest)).toBe(2);
  expect([mode(helper), mode(other)]).toEqual([0o755, 0o755]);
  const changeMode = vi.fn(fchmodSync);
  expect(repairPtyHelpers(manifest, changeMode)).toBe(0); expect(changeMode).not.toHaveBeenCalled();
});

it.skipIf(process.platform === 'win32').each(['app.asar', 'node_modules.asar'])('repairs the physical %s.unpacked helper rather than an archive path', async archive => {
  const { helper, manifest } = await fixture('prebuilds/darwin-arm64', archive);
  expect(existsSync(manifest)).toBe(false);
  expect(repairPtyHelper(manifest, 'prebuilds/darwin-arm64')).toBe(true);
  expect(mode(helper)).toBe(0o755);
});

it.skipIf(process.platform === 'win32').each(['helper', 'parent'])('refuses a %s symlink out of the package without changing its target', async target => {
  const { root, manifest } = await fixture('build/Debug');
  const outside = join(await temporary(), 'outside');
  const other = join(outside, ...(target === 'parent' ? ['darwin-arm64'] : []), 'spawn-helper');
  mkdirSync(dirname(other), { recursive: true }); copyFileSync(original, other); chmodSync(other, 0o644);
  if (target === 'parent') symlinkSync(outside, join(root, 'prebuilds'), 'dir');
  else { mkdirSync(join(root, 'prebuilds/darwin-arm64'), { recursive: true }); symlinkSync(other, join(root, 'prebuilds/darwin-arm64/spawn-helper')); }
  expect(() => repairPtyHelper(manifest, 'prebuilds/darwin-arm64')).toThrow('Unsafe');
  expect(mode(other)).toBe(0o644);
});

it.skipIf(process.platform === 'win32')('refuses traversal, non-files, missing helpers, and a different package', async () => {
  const { root, manifest } = await fixture();
  expect(() => repairPtyHelper(manifest, '../outside')).toThrow('Unexpected');
  expect(() => repairPtyHelper(manifest, 'build/Release')).toThrow();
  mkdirSync(join(root, 'build/Release/spawn-helper'), { recursive: true });
  expect(() => repairPtyHelper(manifest, 'build/Release')).toThrow('Unsafe');
  writeFileSync(manifest, JSON.stringify({ name: 'other-package' }));
  expect(() => repairPtyHelper(manifest, 'prebuilds/darwin-arm64')).toThrow('Invalid');
});

it.skipIf(process.platform === 'win32').each(['EACCES', 'EROFS', 'unchanged'])('fails before spawning with localized recovery when helper repair returns %s', async code => {
  const { helper, manifest } = await fixture(), spawn = vi.fn<PtySpawn>(), output = vi.fn();
  const prepare = () => repairPtyHelper(manifest, 'prebuilds/darwin-arm64', () => { if (code !== 'unchanged') throw Object.assign(new Error('PRIVATE FILESYSTEM DETAILS'), { code }); });
  const action = new ActionPty(spawn, prepare);
  await expect(action.run({ executable: process.execPath, args: [], cwd: dirname(helper), env: {} }, AbortSignal.timeout(5000), output)).rejects.toMatchObject({ code: 'terminal-unavailable', message: 'ai-cli.terminal-unavailable' });
  expect(spawn).not.toHaveBeenCalled(); expect(output).not.toHaveBeenCalled(); expect(mode(helper)).toBe(0o644);
  const previous = i18n.language;
  try {
    for (const language of ['en', 'zh-Hant', 'ja']) {
      await i18n.changeLanguage(language);
      const text = tr('ai-cli:failure_terminal-unavailable');
      expect(text).not.toContain('failure_terminal-unavailable'); expect(text).not.toContain('PRIVATE'); expect(text.length).toBeGreaterThan(30);
    }
  } finally { await i18n.changeLanguage(previous); }
});

it('skips the root guard in CI when install scripts ran, without launching Electron', () => {
  const projectScript = new URL('../../../../../../scripts/ensure-pty-helper.mjs', import.meta.url);
  expect(execFileSync(process.execPath, [fileURLToPath(projectScript)], { env: { ...process.env, CI: '1', npm_config_ignore_scripts: 'false', npm_config_ignore_dep_scripts: 'false' }, encoding: 'utf8' })).toBe('');
});
