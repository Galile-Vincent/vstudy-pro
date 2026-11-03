import { rm, access } from 'node:fs/promises';
export async function deleteAllData(root: string, stop: () => Promise<void>): Promise<void> {
  await stop();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  try { await access(root); } catch { return; }
  throw new Error('Data deletion incomplete');
}
