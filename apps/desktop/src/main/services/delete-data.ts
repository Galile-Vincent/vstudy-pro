import { reviewWorkers } from '../review/workers';
import { rename, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createDataDeletion(
  root: string,
  stop: () => Promise<void>,
  report: (error: unknown) => Promise<unknown>,
  relaunch: () => void,
): () => Promise<void> {
  let started = false;
  return async () => {
    if (started) return;
    started = true;
    try {
      reviewWorkers.suspend('delete-all');
      await reviewWorkers.waitForIdle();
      await stop();
      await rename(root, `${root}.deleting-${Date.now()}-${randomUUID()}`);
    } catch (error) {
      reviewWorkers.resume('delete-all');
      await report(error);
    } finally {
      relaunch();
    }
  };
}

export async function cleanupDeletedData(
  root: string, log: (event: {phase:string;error:unknown}) => void,
): Promise<void> {
  try {
    const parent = dirname(root), prefix = `${basename(root)}.deleting-`;
    const entries = await readdir(parent);
    await Promise.all(entries.filter(name => name.startsWith(prefix)).map(async name => {
      try { await rm(join(parent,name), {recursive:true,force:true}); }
      catch (error) { log({phase:'delete-cleanup-failed',error}); }
    }));
  } catch (error) { log({phase:'delete-cleanup-failed',error}); }
}
