/**
 * Remove the application-owned data namespace after typed and native confirmation.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { rm, access } from 'node:fs/promises';
/** Remove app-owned data only after both typed confirmation and a native confirmation. */
export async function deleteAllData(root: string, stop: () => Promise<void>): Promise<void> {
  await stop();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  try { await access(root); } catch { return; }
  throw new Error('Data deletion incomplete');
}
