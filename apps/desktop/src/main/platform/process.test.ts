/** Check executable locations and the converter's documented isolation boundary. */
import { expect, it } from 'vitest';
import { executableDirectories, pythonInvocation, macSandboxExecutable, managedConverterPython } from './process';
import { executableMetadata, resolveInstalledExecutable } from '../providers/trusted-executable';
import { copyFile, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('uses native Windows locations without adding inherited PATH entries', () => {
  const directories = executableDirectories('win32', {LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local'}, 'C:\\Users\\Ada');
  expect(directories).toContain('C:\\Users\\Ada\\.local\\bin');
  expect(directories).toContain('C:\\Users\\Ada\\AppData\\Local\\Programs\\Python\\Python312');
  expect(directories.some(directory => directory.startsWith('/'))).toBe(false);
});

it('wraps Python in a native deny-network sandbox only on Mac', () => {
  expect(pythonInvocation('/python', ['-B', 'worker.py'], 'darwin')).toEqual({executable: macSandboxExecutable, args: ['-p', '(version 1)(allow default)(deny network*)', '/python', '-B', 'worker.py']});
  expect(pythonInvocation('C:\\Python\\python.exe', ['-B', 'worker.py'], 'win32')).toEqual({executable: 'C:\\Python\\python.exe', args: ['-B', 'worker.py']});
});

it('requests a supported x64 Python only for Windows ARM64', () => {
  expect(managedConverterPython('win32', 'arm64')).toBe('cpython-3.12-windows-x86_64');
  expect(managedConverterPython('win32', 'x64')).toBe('3.12');
  expect(managedConverterPython('darwin', 'arm64')).toBe('3.12');
  expect(managedConverterPython('darwin', 'x64')).toBe('3.12');
});

it.skipIf(process.platform !== 'win32')('resolves a native exe and rejects Windows shell wrappers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-native-exe-'));
  try {
    const binary = join(root, 'claude.exe');
    await copyFile(process.execPath, binary);
    expect(await resolveInstalledExecutable('claude', [root])).toBe(await realpath(binary));
    const wrapper = join(root, 'claude.cmd');
    await writeFile(wrapper, '@echo unsafe');
    await expect(executableMetadata(wrapper)).rejects.toThrow('native Windows executable');
    await writeFile(binary, 'invalid executable');
    expect(await resolveInstalledExecutable('claude', [root])).toBeNull();
  } finally { await rm(root, {recursive: true, force: true, maxRetries: 3}); }
});
