import { access, realpath, stat, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
export const installDirectories = () => [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.claude/local'), join(homedir(), '.codex/bin')];
export async function executableIdentity(path: string) {
  if (!isAbsolute(path)) throw new Error('Executable path must be absolute');
  const resolved = await realpath(path);
  const file = await stat(resolved), directory = await stat(dirname(resolved));
  const owners = [0, process.getuid?.()];
  if (!file.isFile() || !owners.includes(file.uid) || (file.mode & 0o022) || !owners.includes(directory.uid) || (directory.mode & 0o022)) throw new Error('Unsafe executable ownership or permissions');
  await access(resolved, constants.X_OK);
  return { path: resolved, mtime: file.mtimeMs, hash: createHash('sha256').update(await readFile(resolved)).digest('hex') };
}
export async function resolveInstalledExecutable(binary: string, directories = installDirectories()): Promise<string | null> {
  if (!/^[a-z0-9.]+$/i.test(binary)) return null;
  for (const directory of directories) {
    try { return (await executableIdentity(join(directory, binary))).path; } catch { /* Only safe installed executables are eligible. */ }
  }
  return null;
}

export type ExecutableIdentity = Awaited<ReturnType<typeof executableIdentity>>;
