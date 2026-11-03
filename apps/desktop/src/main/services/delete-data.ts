import { rm, access } from 'node:fs/promises';
export async function deleteAllData(root: string, stop: () => Promise<void>): Promise<void> {
  await stop();
  await rm(root, { recursive: true, force: true });
  try { await access(root); } catch { return; }
  throw new Error('Data deletion incomplete');
}
