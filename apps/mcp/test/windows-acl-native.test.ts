/** Verify real protected storage with the stripped environment used by the standalone CLI. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { expect, it } from 'vitest';
import { protectWindowsPath, verifyWindowsPath, type WindowsAclOptions } from '../src/windows-acl';

it.skipIf(process.platform !== 'win32')('protects and verifies files without inherited PowerShell modules and refuses foreign access', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vstudy-sdk-acl-'));
  const file = join(directory, 'private.json');
  const environment = {SystemRoot: process.env.SystemRoot ?? 'C:\\Windows'};
  const diagnostics: string[] = [];
  const execute: NonNullable<WindowsAclOptions['execute']> = (executable, args, options) => {
    try {return execFileSync(executable, args, options);}
    catch (error) {
      if (error instanceof Error && 'stderr' in error) diagnostics.push(String(error.stderr).slice(-2400));
      throw error;
    }
  };
  try {
    writeFileSync(file, 'synthetic UTF-8 課程');
    protectWindowsPath(file, false, {environment, execute});
    verifyWindowsPath(file, false, {environment, execute});
    expect(readFileSync(file, 'utf8')).toBe('synthetic UTF-8 課程');
    const powershell = win32.join(environment.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "$a=[IO.File]::GetAccessControl($env:VSTUDY_ACL_FIXTURE); $a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)); [IO.File]::SetAccessControl($env:VSTUDY_ACL_FIXTURE,$a)"],
      {env: {...environment, VSTUDY_ACL_FIXTURE: file}, windowsHide: true, timeout: 30_000});
    expect(() => verifyWindowsPath(file, false, {environment, execute})).toThrow('unavailable or unsafe');
  } catch (error) {
    console.error('Synthetic native ACL fixture failed', diagnostics);
    throw error;
  } finally {rmSync(directory, {recursive: true, force: true, maxRetries: 10});}
}, 120_000);
