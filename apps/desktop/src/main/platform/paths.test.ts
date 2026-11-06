/** Exercise Windows path semantics on every host and portable archive names. */
import { expect, it } from 'vitest';
import { isPathWithin, isPortableRelativePath, portableBasename } from './paths';

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

it.each(['../secret', '/root', 'C:/secret', 'C:secret', '//server/share', '\\\\server\\share',
  'assets/../secret', 'assets\\secret', 'NUL.png', 'con.txt', 'COM1', 'LPT².txt',
  'assets/name:stream', 'assets/file.', 'assets/file ', 'a//b', 'a/./b', 'a\0b', 'a'.repeat(256),
])('rejects nonportable name %j', name => expect(isPortableRelativePath(name)).toBe(false));

it('keeps ordinary Unicode filenames and extracts names from either OS', () => {
  expect(isPortableRelativePath('assets/學習筆記 1.png')).toBe(true);
  expect(portableBasename('C:\\Users\\Student\\library\\source.pdf')).toBe('source.pdf');
  expect(portableBasename('/Users/student/library/source.pdf')).toBe('source.pdf');
});
