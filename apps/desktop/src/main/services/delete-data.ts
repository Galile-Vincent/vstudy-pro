import { reviewWorkers } from '../review/workers';
import { rename, readdir, rm, open, lstat, realpath } from 'node:fs/promises';
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
    if (started) throw Error('Deletion already in progress');
    started = true;
    try {
      reviewWorkers.suspend('delete-all');
      await markDeletionPending(root);
      await quiesce(async () => { await reviewWorkers.waitForIdle(); await stop(); });
      if (process.platform === 'win32' || (await lstat(root)).isSymbolicLink()) {
        await realpath(root);
      }
      else {
        try {
          await rename(root, `${root}.deleting-${Date.now()}-${randomUUID()}`);
          await rm(root + '.delete-pending', {force:true});
        }
        catch (error) { await markDeletionPending(root); await report(error); }
      }
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

const removeOptions = {recursive:true, force:true, maxRetries:5, retryDelay:200};
const ownedNames = new Set([
  'secrets.json', 'providers.json', 'executable-pins.json', 'library',
  'ai-tools', 'converter-venv', 'converter-python', 'mcp', 'logs', 'tmp', 'fts-check.json',
  'window-state.json', 'window-state.json.tmp', 'restore-pending.json',
  'restore-startup.json',
]);
function ownedEntry(name: string): boolean {
  const temporary = /^(.*)\.[0-9a-f-]{36}\.tmp$/.exec(name);
  if (temporary && ownedNames.has(temporary[1]!)) return true;
  return ownedNames.has(name) || /^vstudy\.sqlite(?:-(?:wal|shm|journal))?$/.test(name)
    || /^moodle(?:$|[-.])/.test(name) || /^\.(?:backup|restore|download)-/.test(name);
}
export async function markDeletionPending(root: string): Promise<void> {
  const file = await open(root + '.delete-pending', 'w', 0o600);
  try {
    await file.writeFile(JSON.stringify({token:randomUUID(), timestamp:Date.now()}));
    await file.sync();
  } finally { await file.close(); }
  if (process.platform !== 'win32') {
    const parent = await open(dirname(root), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  }
}
export async function finishPendingDeletion(
  root: string,
  clearSessions: (partitions: string[]) => Promise<void>,
  log: (event: {phase:string;error:unknown}) => void,
): Promise<boolean> {
  try { await lstat(root + '.delete-pending'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    log({phase:'delete-pending-failed',error}); return false;
  }
  try {
    const target = await realpath(root);
    let partitions: string[] = [];
    try {
      const directory = join(target, 'Partitions');
      if ((await lstat(directory)).isSymbolicLink()) throw Error('Unsafe session directory');
      partitions = (await readdir(directory)).filter(name => !name.includes('/') && !name.includes('\\'));
      for (const name of partitions) {
        if ((await lstat(join(directory,name))).isSymbolicLink()) throw Error('Unsafe session partition');
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const name of await readdir(target)) {
      if (ownedEntry(name)) await rm(join(target, name), removeOptions);
    }
    await clearSessions(partitions);
    await rm(root + '.delete-pending', {force:true});
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
