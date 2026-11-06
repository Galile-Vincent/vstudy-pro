/** Verify the Windows state boundary and execute its native ACL/atomic-write contract on Windows. */
import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, link, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createWindowsStatePersistence } from './windows-state';
import { systemExecutable } from '../platform/process';

vi.mock('electron', () => ({app: {isPackaged: false}}));
const directory = String.raw`C:\Users\Ada\AppData\Roaming\@vstudy\desktop`;

it('keeps state out of arguments and inherited secrets and decodes only verified UTF-8', () => {
  const body = '{"name":"課程 日本語","version":1}';
  const execute = vi.fn((_executable, args, options) => {
    expect(args).not.toContain(body);
    expect(options.shell).toBe(false);
    expect(options.windowsHide).toBe(true);
    expect(options.env).not.toHaveProperty('VSTUDY_STATE_SENTINEL');
    if (args.at(-1) === 'write') {
      expect(Buffer.from(options.input, 'base64').toString('utf8')).toBe(body);
      return 'ok';
    }
    return 'state:' + Buffer.from(body).toString('base64');
  });
  vi.stubEnv('VSTUDY_STATE_SENTINEL', 'must-not-leak');
  try {
    const store = createWindowsStatePersistence({platform: 'win32', present: () => true, execute});
    expect(store.read(directory)).toBe(body);
    store.write(directory, body);
    expect(execute).toHaveBeenCalledTimes(2);
  } finally {vi.unstubAllEnvs();}
});

it('does not launch a helper for absent state and rejects unsupported paths or unsafe output', () => {
  const execute = vi.fn(() => 'ok');
  const absent = createWindowsStatePersistence({platform: 'win32', present: () => false, execute});
  expect(absent.read(directory)).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
  for (const path of ['relative', String.raw`C:relative`, String.raw`\\server\share`, directory + ':stream']) {
    expect(() => absent.write(path, '{}')).toThrow('could not be verified');
  }
  expect(() => createWindowsStatePersistence({platform: 'darwin'}).read(directory)).toThrow('could not be verified');
  const oversized = 'x'.repeat(8 * 1024 * 1024 + 1);
  expect(() => absent.write(directory, oversized)).toThrow('could not be verified');
  expect(execute).not.toHaveBeenCalled();
  for (const output of ['not-a-state', 'state:invalid==', 'state:/w==']) {
    const store = createWindowsStatePersistence({platform: 'win32', present: () => true, execute: () => output});
    expect(() => store.read(directory)).toThrow('could not be verified');
  }
});

it.skipIf(process.platform !== 'win32')('persists and replaces state with a protected current-SID ACL and rejects broadened ACLs and hardlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-state-native-'));
  const diagnostics: string[] = [];
  const store = createWindowsStatePersistence({script: resolve('resources/mcp/windows-state.ps1'), execute: (executable, args, options) => {
    try { return execFileSync(executable, args, options); }
    catch (error) {
      if (error instanceof Error && 'stderr' in error) diagnostics.push(String(error.stderr).slice(-2400));
      throw error;
    }
  }});
  const file = win32.join(root, 'mcp', 'state.json');
  const powershell = systemExecutable('WindowsPowerShell/v1.0/powershell.exe');
  const command = (script: string) => execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, env: {...process.env, VSTUDY_STATE_PATH: file},
  });
  try {
    expect(store.read(root)).toBeUndefined();
    const text = JSON.stringify({version: 1, label: '課程 日本語', values: [1, 2, 3]});
    store.write(root, text);
    expect(store.read(root)).toBe(text);
    store.write(root, '{"replacement":true}');
    expect(store.read(root)).toBe('{"replacement":true}');
    expect(await readFile(file, 'utf8')).toBe('{"replacement":true}');
    expect(await lstat(file).then(info => info.nlink)).toBe(1);
    const acl = JSON.parse(command(`$a=Get-Acl -LiteralPath $env:VSTUDY_STATE_PATH; [pscustomobject]@{Owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value; Current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; Protected=$a.AreAccessRulesProtected; Entries=@($a.Access).Count} | ConvertTo-Json -Compress`));
    expect(acl.Owner).toBe(acl.Current);
    expect(acl.Protected).toBe(true);
    expect(acl.Entries).toBe(1);
    const other = join(root, 'link.json');
    await link(file, other);
    expect(() => store.read(root)).toThrow('could not be verified');
    expect(() => store.write(root, '{}')).toThrow('could not be verified');
    await rm(other);
    command(`$a=Get-Acl -LiteralPath $env:VSTUDY_STATE_PATH; $a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)); Set-Acl -LiteralPath $env:VSTUDY_STATE_PATH -AclObject $a`);
    expect(() => store.read(root)).toThrow('could not be verified');
    expect(() => store.write(root, '{}')).toThrow('could not be verified');
  } catch (error) {
    console.error('Native Windows state fixture failed', diagnostics);
    throw error;
  } finally {await rm(root, {recursive: true, force: true, maxRetries: 3});}
}, 180000);
