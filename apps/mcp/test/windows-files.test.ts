/** Model Windows private-file ordering with mocked ACL calls; no Windows ACL acceptance is claimed. @packageDocumentation */
import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { protectWindowsPath, verifyWindowsPath } from '../src/windows-acl';
import { ensureDirectory, readLocal, writeExclusive } from '../src/files';

vi.mock('../src/windows-acl', () => ({ protectWindowsPath: vi.fn(), verifyWindowsPath: vi.fn() }));
const roots: string[] = [];
afterEach(() => { vi.resetAllMocks(); for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function onWindows(run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  try { Object.defineProperty(process, 'platform', { value: 'win32' }); run(); }
  finally { Object.defineProperty(process, 'platform', descriptor); }
}
function root() { const path = mkdtempSync(join(realpathSync(tmpdir()), 'vwfile-')); roots.push(path); return path; }

it('secures newly app-owned directories and empty files before writing bearer bytes', () => {
  const directory = join(root(), 'private');
  onWindows(() => {
    ensureDirectory(directory, true);
    expect(protectWindowsPath).toHaveBeenCalledWith(directory, true);
    expect(verifyWindowsPath).toHaveBeenCalledWith(directory, true);
    const file = join(directory, 'codex.json');
    vi.mocked(protectWindowsPath).mockImplementation(path => { expect(readFileSync(path, 'utf8')).toBe(''); });
    writeExclusive(file, 'opaque local bearer');
    expect(readFileSync(file, 'utf8')).toBe('opaque local bearer');
  });
});

it('does not publish bearer bytes when ACL enforcement fails', () => {
  const file = join(root(), 'codex.json');
  vi.mocked(protectWindowsPath).mockImplementation(() => { throw new Error('ACL unavailable'); });
  onWindows(() => { expect(() => writeExclusive(file, 'must not be written')).toThrow(); });
  expect(existsSync(file)).toBe(false);
});

it('verifies existing private paths and refuses unsafe reads without modifying user directory ACLs', () => {
  const directory = root();
  const file = join(directory, 'codex.json'); writeFileSync(file, 'private bearer');
  onWindows(() => {
    ensureDirectory(directory);
    expect(protectWindowsPath).not.toHaveBeenCalled();
    ensureDirectory(directory, true);
    expect(protectWindowsPath).not.toHaveBeenCalled();
    vi.mocked(verifyWindowsPath).mockImplementation(() => { throw new Error('Foreign ACE'); });
    expect(() => readLocal(file, true)).toThrow();
    expect(protectWindowsPath).not.toHaveBeenCalled();
  });
  const userDirectory = join(directory, 'user-config'); mkdirSync(userDirectory);
  onWindows(() => ensureDirectory(userDirectory));
  expect(protectWindowsPath).not.toHaveBeenCalled();
});
