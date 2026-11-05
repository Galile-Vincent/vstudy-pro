/**
 * Recover staged restores and reconcile database metadata with contained files.
 * Owned by main/storage.
 * Filesystem operations stay inside the application namespace and preserve recoverable state.
 * @packageDocumentation
 */
/** Startup removes recognized incomplete writes. Untracked originals are preserved for recovery. */
import { readdir, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';

/** Run before imports and conversions can start. Never traverse symlinks or remove hash directories. */
export async function reconcileLibrary(root: string): Promise<number> {
  let removed = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\.import-[a-zA-Z0-9]+$/.test(entry.name)) {
      await rm(join(root, entry.name), { recursive: true, force: true, maxRetries: 3 }); removed++;
    } else if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)) {
      for (const name of await readdir(join(root, entry.name))) {
        if (!/^content(?:\.ai)?\.md(?:\.json)?(?:\.partial)?(?:\.partial|\.tmp|\.[a-f0-9-]+\.(?:tmp|json))$/.test(name)) continue;
        const path = join(root, entry.name, name);
        if ((await lstat(path)).isFile()) { await rm(path, { force: true }); removed++; }
      }
    }
  }
  return removed;
}

/** Downloads are staging only. No user originals live under this directory. */
export async function reconcileDownloads(root:string):Promise<void>{
  const entries=await readdir(root,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  for(const entry of entries)if(entry.isDirectory() && /^\.download-[a-zA-Z0-9]+$/.test(entry.name))await rm(join(root,entry.name),{recursive:true,force:true,maxRetries:3});
}
