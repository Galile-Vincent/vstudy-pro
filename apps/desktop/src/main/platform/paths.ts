/** Cross-platform path policies for native containment and portable document names. */
import path from 'node:path';

/** Compare native paths with drive, UNC, and separator rules of the selected platform. */
export function isPathWithin(root: string, candidate: string, platform = process.platform): boolean {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const relative = paths.relative(paths.resolve(root), paths.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
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
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
}
