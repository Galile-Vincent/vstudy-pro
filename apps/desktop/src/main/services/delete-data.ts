/**
 * Remove the application-owned data namespace after typed and native confirmation.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { reviewWorkers } from '../review/workers';
import { rm, access } from 'node:fs/promises';
/** Remove app-owned data only after both typed confirmation and a native confirmation. */
export async function deleteAllData(root: string, stop: () => Promise<void>): Promise<void> {
  reviewWorkers.suspend('delete-all');
  try {
    await reviewWorkers.waitForIdle();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    let exists = true;
    try { await access(root); } catch { exists = false; }
    if (exists) throw new Error('INCOMPLETE');
  } catch (error) {
    reviewWorkers.resume('delete-all');
    const code = (error as NodeJS.ErrnoException).code;
    const reason = code === 'EACCES' || code === 'EPERM' ? 'permission' : code === 'EBUSY' ? 'busy' : 'files';
    throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'settings.delete_failed_' + reason,params:{}}));
  }
  await stop();
}
