/** Native-dialog exports preserve existing bytes if writing fails. Paths never come from IPC. */
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { atomicWrite, validateDestination } from '../storage/atomic';

export async function exportFile(sourcePath: string, destinationPath: string): Promise<void> {
  await validateDestination(destinationPath);
  const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const input = await source.stat();
    const output = await lstat(destinationPath).catch(error => {if (error.code === 'ENOENT') return undefined; throw error;});
    if (output && output.dev === input.dev && output.ino === input.ino) throw new Error('Unsafe export destination');
    if (!input.isFile()) throw new Error('Unsafe export source');
    await atomicWrite(destinationPath, await source.readFile());
  } finally { await source.close(); }
}
export async function exportText(text: string, destinationPath: string): Promise<void> {
  await validateDestination(destinationPath);
  await atomicWrite(destinationPath, text);
}
