import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
export async function exportFile(sourcePath: string, destinationPath: string): Promise<void> {
  const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const input = await source.stat();
    const destination = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const output = await destination.stat();
      if (!output.isFile() || output.nlink !== 1 || (input.dev === output.dev && input.ino === output.ino)) throw new Error('Unsafe export destination');
      await destination.chmod(0o600);
      await destination.truncate(0);
      await destination.writeFile(await source.readFile());
    } finally { await destination.close(); }
  } finally { await source.close(); }
}
