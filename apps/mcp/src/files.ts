/** Bound local file reads and replace files atomically without following symlinks. @packageDocumentation */
import {
  constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { protectWindowsPath, verifyWindowsPath } from './windows-acl';

export class LocalFileError extends Error {}

export function assertNoSymlinks(path: string): void {
  if (!isAbsolute(path)) throw new LocalFileError('An absolute file path is required.');
  const root = parse(path).root;
  const pieces = relative(root, resolve(path)).split(sep);
  let current = root;
  for (const [index, piece] of pieces.entries()) {
    current = resolve(current, piece);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < pieces.length - 1 && !stat.isDirectory())) {
        throw new LocalFileError('Refusing a symlink or non-directory in a local configuration path.');
      }
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function readLocal(path: string, privateFile = false): string | undefined {
  assertNoSymlinks(path);
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (isMissing(error)) return undefined; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024
      || (process.getuid && stat.uid !== process.getuid())
      || (privateFile && process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600)) {
      throw new LocalFileError('Local file ownership, size, or permissions are unsafe.');
    }
    if (privateFile && process.platform === 'win32') verifyWindowsPath(path, false);
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}

export function ensureDirectory(path: string, privateDirectory = false): void {
  assertNoSymlinks(path);
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (privateDirectory && !existed && process.platform === 'win32') protectWindowsPath(path, true);
  checkDirectory(path, privateDirectory);
}

export function checkDirectory(path: string, privateDirectory = true): void {
  assertNoSymlinks(path);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || (process.getuid && stat.uid !== process.getuid())
    || (privateDirectory && process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700)) {
    throw new LocalFileError('Local directory ownership or permissions are unsafe.');
  }
  if (privateDirectory && process.platform === 'win32') verifyWindowsPath(path, true);
}

export function writeExclusive(path: string, text: string): void {
  assertNoSymlinks(path);
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let complete = false;
  try {
    if (process.platform === 'win32') protectWindowsPath(path, false);
    writeFileSync(fd, text); fsyncSync(fd); complete = true;
  } finally { closeSync(fd); if (!complete) unlinkSync(path); }
}

export function replaceLocal(path: string, text: string, expected: string | undefined): void {
  assertNoSymlinks(path);
  const staging = `${path}.vstudy-tmp-${randomUUID()}`;
  try {
    writeExclusive(staging, text);
    if (readLocal(path) !== expected) throw new LocalFileError('Configuration changed during installation. Retry after other clients finish writing.');
    renameSync(staging, path);
    if (process.platform !== 'win32') {
      const fd = openSync(dirname(path), constants.O_RDONLY);
      try { fsyncSync(fd); } finally { closeSync(fd); }
    }
  } finally { if (existsSync(staging)) unlinkSync(staging); }
}
