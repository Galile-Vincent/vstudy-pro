/**
 * Replace private files atomically and sync directory entries for crash recovery.
 * Owned by main/storage.
 * Filesystem operations stay inside the application namespace and preserve recoverable state.
 * @packageDocumentation
 */
/** Durable replacement of main-owned files. Temporary files stay beside their destination. */
import { randomUUID } from 'node:crypto';
import { open, rename, rm, lstat } from 'node:fs/promises';
import { openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** Retry transient file locks without hiding permission or capacity failures. */
export async function retryBusy<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EBUSY' || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

/** Flush a directory after publishing or removing a file. */
export async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

/** Publish only a complete, flushed file. A failure before rename preserves the old bytes. */
export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    await retryBusy(() => rename(temporary, path));
    await syncDirectory(dirname(path));
  } finally { await rm(temporary, { force: true }); }
}

/** Small configuration stores keep their synchronous API, with the same durability guarantee. */
export function atomicWriteSync(path: string, data: string | Uint8Array): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(file, data); fsyncSync(file); } finally { closeSync(file); }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { rmSync(temporary, { force: true }); }
}

/** Refuse replacement of symlinks and hard links selected in a native export dialog. */
export async function validateDestination(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.nlink !== 1) throw new Error('Unsafe export destination');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
