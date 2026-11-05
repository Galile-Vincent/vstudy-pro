/** Keep the prior installation recoverable until the restored app completes startup. */
import { lstat, readFile, rename, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { syncDirectory } from './atomic';
const journalSchema = z.object({directory:z.string().regex(/^\.restore-[a-zA-Z0-9]+$/)}).strict();
const exists = (path:string) => lstat(path).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;});

/** Mark restored data as accepted only after services and the renderer have loaded. */
export async function confirmRestoreStartup(root:string):Promise<void> {
  await rm(join(root,'restore-startup.json'),{force:true});
  await syncDirectory(root);
}

/** Roll back failed or interrupted startup, retaining rejected data for inspection. Reentrant after crashes. */
export async function rollbackRestoreStartup(root:string):Promise<boolean> {
  const journal=join(root,'restore-startup.json');
  if(!await exists(journal))return false;
  const {directory}=journalSchema.parse(JSON.parse(await readFile(journal,'utf8')));
  const stage=join(root,directory), previous=join(stage,'previous'), failed=join(stage,'failed');
  for(const path of [stage,previous]) {
    const info=await lstat(path);
    if(!info.isDirectory() || info.isSymbolicLink())throw new Error('storage.invalid_backup');
  }
  await mkdir(failed,{recursive:true,mode:0o700});
  for(const name of ['vstudy.sqlite-wal','vstudy.sqlite-shm','vstudy.sqlite','library']) {
    const current=join(root,name),old=join(previous,name),rejected=join(failed,name);
    if(await exists(old)) {
      if(await exists(current) && !await exists(rejected))await rename(current,rejected);
      if(!await exists(rejected))await mkdir(rejected,{mode:0o700});
      await syncDirectory(failed);
      await rename(old,current);
    } else if(!await exists(rejected) && await exists(current))await rename(current,rejected);
    await syncDirectory(root);await syncDirectory(previous);await syncDirectory(failed);
  }
  await rm(journal);await syncDirectory(root);return true;
}
