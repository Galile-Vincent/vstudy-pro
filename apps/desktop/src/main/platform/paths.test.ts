/** Exercise Windows path semantics on every host and portable archive names. */
import { expect, it } from 'vitest';
import { isPathWithin, isRealPathWithin, isPortableRelativePath, portableBasename } from './paths';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { containedPath } from '../services/file-paths';

it.each([
  ['C:\\Users\\Student\\Library', 'c:\\users\\student\\library\\notes.md', true],
  ['C:\\library', 'C:\\library-extra\\notes.md', false],
  ['C:\\library', 'C:\\library\\..\\secret', false],
  ['C:\\library', 'D:\\library\\notes.md', false],
  ['C:\\library', 'C:\\library', false],
  ['\\\\server\\share\\library', '\\\\SERVER\\share\\library\\notes.md', true],
  ['\\\\server\\share\\library', '\\\\server\\other\\library\\notes.md', false],
])('contains Windows path %s -> %s = %s', (root, file, expected) => {
  expect(isPathWithin(root, file, 'win32')).toBe(expected);
});

it.each([
  [String.raw`C:\Library`, String.raw`c:\Library\notes.md`, true],
  [String.raw`C:\Library`, String.raw`C:\library\notes.md`, false],
  [String.raw`\\server\share\Library`, String.raw`\\SERVER\SHARE\Library\notes.md`, true],
  [String.raw`\\server\share\Library`, String.raw`\\server\share\library\notes.md`, false],
])('keeps canonical Windows directory case at the filesystem boundary', (root, file, expected) => {
  expect(isRealPathWithin(root, file, 'win32')).toBe(expected);
});

it.each(['../secret', '/root', 'C:/secret', 'C:secret', '//server/share', '\\\\server\\share',
  'assets/../secret', 'assets\\secret', 'NUL.png', 'con.txt', 'COM1', 'LPT².txt',
  'CONIN$', 'CONOUT$.txt', 'assets/name:stream', 'assets/file.', 'assets/file ', 'a//b', 'a/./b', 'a\0b', 'a'.repeat(256),
])('rejects nonportable name %j', name => expect(isPortableRelativePath(name)).toBe(false));

it('keeps ordinary Unicode filenames and extracts names from either OS', () => {
  expect(isPortableRelativePath('assets/學習筆記 1.png')).toBe(true);
  expect(portableBasename('C:\\Users\\Student\\library\\source.pdf')).toBe('source.pdf');
  expect(portableBasename('/Users/student/library/source.pdf')).toBe('source.pdf');
});

it('contains a Unicode library file whose absolute path exceeds 260 characters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-long-path-'));
  try {
    const directory = join(root, 'a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100));
    await mkdir(directory, {recursive: true});
    const file = join(directory, '學習.md');
    await writeFile(file, '# Study');
    expect(file.length).toBeGreaterThan(260);
    expect(containedPath(root, file)).toBe(await realpath(file));
  } finally { await rm(root, {recursive: true, force: true, maxRetries: 3}); }
});
