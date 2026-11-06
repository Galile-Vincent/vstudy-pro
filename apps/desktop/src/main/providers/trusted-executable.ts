/**
 * Resolve executable metadata and hashes from trusted installation directories.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { access, realpath, stat, open } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { executableDirectories } from '../platform/process';
import { createHash } from 'node:crypto';
export const installDirectories = executableDirectories;
/** Read executable file metadata without launching or hashing the binary. */
export async function executableMetadata(path: string) {
  if (!isAbsolute(path)) throw new Error('Executable path must be absolute');
  const resolved = await realpath(path);
  const file = await stat(resolved), directory = await stat(dirname(resolved));
  const owners = [0, process.getuid?.()];
  if (!file.isFile()) throw new Error('Executable must be a regular file');
  if (process.platform === 'win32') {
    if (!/\.exe$/i.test(resolved)) throw new Error('Choose a native Windows executable (.exe)');
    const handle = await open(resolved, 'r');
    try {
      const header = Buffer.alloc(2);
      if ((await handle.read(header, 0, 2, 0)).bytesRead !== 2 || header.toString() !== 'MZ') throw new Error('Invalid Windows executable');
    } finally { await handle.close(); }
  } else if (!owners.includes(file.uid) || (file.mode & 0o022) || !owners.includes(directory.uid) || (directory.mode & 0o022)) throw new Error('Unsafe executable ownership or permissions');
  await access(resolved, constants.X_OK);
  return { path: resolved, mtime: file.mtimeMs };
}
/** Hash a validated executable to detect changes that require confirmation. */
export async function executableIdentity(path: string) {
  const metadata = await executableMetadata(path);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(metadata.path)) digest.update(chunk);
  return {...metadata,hash:digest.digest('hex')};
}
/** Search trusted installation directories without trusting inherited PATH. */
export async function resolveInstalledExecutable(binary: string, directories = installDirectories()): Promise<string | null> {
  if (!/^[a-z0-9.]+$/i.test(binary)) return null;
  for (const directory of directories) {
    try { return (await executableMetadata(join(directory, process.platform === 'win32' && !binary.endsWith('.exe') ? `${binary}.exe` : binary))).path; } catch { /* Only safe installed executables are eligible. */ }
  }
  return null;
}

export type ExecutableIdentity = Awaited<ReturnType<typeof executableIdentity>>;
