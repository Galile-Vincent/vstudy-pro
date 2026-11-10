import { stopStorageForDeletion } from '../storage/maintenance';
import { reviewWorkers } from '../review/workers';
import { rename, readdir, rm, open, lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';

export function createDataDeletion(
  root: string,
  stop: () => Promise<void>,
  report: (error: unknown, scheduled?: boolean) => Promise<unknown>,
  relaunch: () => void,
): () => Promise<void> {
  let started = false;
  return async () => {
    if (started) throw Error('Deletion already in progress');
    started = true;
    let scheduled = false;
    try {
      reviewWorkers.suspend('delete-all');
      await markDeletionPending(root);
      scheduled = true;
      await quiesce(async () => {
        await stop();
        await stopStorageForDeletion();
        await reviewWorkers.waitForIdle();
      });
      if (process.platform === 'win32' || (await lstat(root)).isSymbolicLink()) {
        const failures = await deleteOwnedEntries(await realpath(root));
        if (failures.length) await report(failures[0]!.error, true);
        else await removeDeletionMarker(root);
      }
      else {
        try {
          await rename(root, `${root}.deleting-${Date.now()}-${randomUUID()}`);
          await removeDeletionMarker(root);
          await cleanupDeletedData(root, event => { void report(event.error, true); });
        }
        catch (error) { await report(error, scheduled); }
      }
    } catch (error) {
      if (!scheduled) reviewWorkers.resume('delete-all');
      await report(error, scheduled);
    } finally {
      if (scheduled) relaunch();
      else started = false;
    }
  };
}

export async function cleanupDeletedData(
  root: string, log: (event: {phase:string;error:unknown}) => void,
): Promise<boolean> {
  const failures: unknown[] = [];
  try {
    const parent = dirname(root), prefix = basename(root);
    const entries = await readdir(parent);
    await Promise.all(entries.filter(name => name.startsWith(prefix)
      && /^\.deleting-\d+-[0-9a-f-]{36}$/.test(name.slice(prefix.length))).map(async name => {
      try {
        const candidate = join(parent,name);
        const stat = await lstat(candidate);
        if (candidate === root || !stat.isDirectory() || stat.isSymbolicLink()) return;
        await rm(candidate, removeOptions);
      }
      catch (error) { failures.push(error); }
    }));
  } catch (error) { failures.push(error); }
  if (failures.length) log({phase:'delete-cleanup-failed',
    error:new AggregateError(failures,'Quarantine deletion incomplete')});
  return failures.length === 0;
}

const removeOptions = {recursive:true, force:true, maxRetries:5, retryDelay:200};
// Chromium owns these while Electron is alive; session APIs clear their user data.
export const CHROMIUM_HELD_ENTRIES = new Set([
  'Local State', 'lockfile', 'SingletonLock', 'SingletonCookie',
  'SingletonSocket', 'Network', 'Preferences',
]);
function ownedEntry(name: string): boolean {
  return !CHROMIUM_HELD_ENTRIES.has(name);
}
function deletionPriority(name: string): number {
  if (/^(secrets|providers)(?:\.|$)/.test(name)) return 0;
  if (name.startsWith('vstudy.sqlite') || /\.(bak|tmp)$/.test(name)) return 1;
  return 2;
}
export async function deleteOwnedEntries(
  target: string,
): Promise<{path:string;error:unknown}[]> {
  const names = await readdir(target).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const failed: {path:string;error:unknown}[] = [];
  for (const name of names.filter(ownedEntry).sort((a,b) =>
    deletionPriority(a) - deletionPriority(b) || a.localeCompare(b))) {
    const path = join(target,name);
    try { await rm(path,removeOptions); }
    catch (error) { failed.push({path,error}); }
  }
  for (const delay of [100,300,700]) {
    if (!failed.length) break;
    await new Promise(resolve => setTimeout(resolve,delay));
    for (const failure of [...failed]) {
      try { await rm(failure.path,removeOptions); failed.splice(failed.indexOf(failure),1); }
      catch (error) { failure.error = error; }
    }
  }
  return failed;
}
async function removeDeletionMarker(root: string): Promise<void> {
  for (const delay of [0,100,300,700]) {
    if (delay) await new Promise(resolve => setTimeout(resolve,delay));
    try { await rm(root + '.delete-pending',{force:true}); return; }
    catch (error) { if (delay === 700) throw error; }
  }
}
export async function markDeletionPending(root: string): Promise<void> {
  const marker = root + '.delete-pending';
  let created = false;
  try {
    const file = await open(marker, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    try {
      await file.writeFile(JSON.stringify({token:randomUUID(), timestamp:Date.now()}));
      await file.sync();
    } finally { await file.close(); }
    if (process.platform !== 'win32') {
      const parent = await open(dirname(root), 'r');
      try { await parent.sync(); }
      catch (error) {
        if (!['EINVAL','ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      } finally { await parent.close(); }
    }
  } catch (error) {
    if (created) await removeDeletionMarker(root);
    throw error;
  }
}
export async function finishPendingDeletion(
  root: string,
  clearSessions: (partitions: string[]) => Promise<void>,
  log: (event: {phase:string;error:unknown}) => void,
): Promise<boolean> {
  try {
    const marker = await open(root + '.delete-pending',
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let timestamp: unknown;
    try {
      const stat = await marker.stat();
      if (!stat.isFile() || stat.size > 4096) throw Error('Unsafe deletion marker');
      timestamp = JSON.parse(await marker.readFile('utf8')).timestamp;
    } finally { await marker.close(); }
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)
      || Date.now() - timestamp > 86_400_000 || timestamp > Date.now()) {
      await removeDeletionMarker(root);
      log({phase:'delete-marker-expired',error:Error('Deletion request expired; confirm again')});
      return false;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    log({phase:'delete-pending-failed',error}); return false;
  }
  try {
    const target = await realpath(root).catch(error => {
      if (error.code === 'ENOENT') return root;
      throw error;
    });
    const failures = await deleteOwnedEntries(target);
    await clearSessions([]);
    if (failures.length) {
      for (const failure of failures) log({phase:'delete-pending-failed',error:failure.error});
      return false;
    }
    await removeDeletionMarker(root);
    return true;
  } catch (error) { log({phase:'delete-pending-failed',error}); return false; }
}

async function quiesce(work: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([work(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(Error('Deletion quiesce timed out')), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}
