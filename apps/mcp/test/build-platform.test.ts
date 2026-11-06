/** Inspect build dispatch argv and actual Windows resource-layout fixtures without a Windows process. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const inspect = (script: string, platform: string) => JSON.parse(execFileSync(process.execPath,
  [resolve('../desktop/scripts', script), '--dry-run', '--platform', platform], { encoding: 'utf8' }));

it('skips the Unix C build on Windows and retains its exact root entry on Unix', () => {
  expect(inspect('build-mcp-platform.mjs', 'win32')).toEqual({ platform: 'win32', command: null });
  const unix = inspect('build-mcp-platform.mjs', 'darwin');
  expect(unix.command.executable).toBe(process.execPath);
  expect(unix.command.args).toEqual([resolve('../../scripts/build-mcp-peer.mjs')]);
});

it('selects native host packaging arguments without invoking a package-manager command shell', () => {
  const windows = inspect('package-platform.mjs', 'win32');
  expect(windows.command.executable).toBe(process.execPath);
  expect(windows.command.args.slice(1)).toEqual(['--win', 'nsis', 'dir']);
  expect(inspect('package-platform.mjs', 'darwin').command.args.slice(1)).toEqual(['--mac', 'dmg', 'dir']);
});

it('checks a win-unpacked resources layout without requiring an absent Unix helper', () => {
  const release = mkdtempSync('/private/tmp/vwin-layout-'); roots.push(release);
  const target = join(release, 'win-unpacked/resources/mcp'); mkdirSync(target, { recursive: true });
  cpSync('dist', join(target, 'dist'), { recursive: true });
  cpSync('plugins', join(target, 'plugins'), { recursive: true });
  cpSync('CLIENT_FORMATS.md', join(target, 'CLIENT_FORMATS.md'));
  const result = execFileSync(process.execPath, [resolve('scripts/verify-package.mjs'), '--release-dir', release], { encoding: 'utf8' });
  expect(result).toContain('Unix helper not required');
  expect(result).toContain('Main Windows host/persistence acceptance remains unverified');
});
