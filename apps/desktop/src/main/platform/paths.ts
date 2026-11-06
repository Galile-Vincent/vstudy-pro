/** Cross-platform path policies for native containment and portable document names. */
import path from 'node:path';

/** Compare native paths with drive, UNC, and separator rules of the selected platform. */
export function isPathWithin(root: string, candidate: string, platform = process.platform): boolean {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const relative = paths.relative(paths.resolve(root), paths.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
}

/** Canonical realpath results retain directory case, including case-sensitive Windows directories. */
export function isRealPathWithin(root: string, candidate: string, platform = process.platform): boolean {
  if (platform !== 'win32') return isPathWithin(root, candidate, platform);
  if (!path.win32.isAbsolute(root) || !path.win32.isAbsolute(candidate)) return false;
  const rootVolume = path.win32.parse(root).root, candidateVolume = path.win32.parse(candidate).root;
  if (rootVolume.toLowerCase() !== candidateVolume.toLowerCase()) return false;
  return isPathWithin('/' + root.slice(rootVolume.length).replaceAll('\\', '/'),
    '/' + candidate.slice(candidateVolume.length).replaceAll('\\', '/'), 'linux');
}

/** Backup databases can contain paths from a different operating system. */
export function portableBasename(value: string): string {
  return path.posix.basename(value.replaceAll('\\', '/'));
}

/** Reject paths that can escape or alias files when moved between Mac and Windows. */
export function isPortableRelativePath(value: string): boolean {
  if (!value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part.length <= 255 &&
    !/[<>:"|?*\p{Cc}]/u.test(part) && !/[. ]$/.test(part) &&
    !/^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
}
