/**
 * Regression coverage for storage atomic.
 * Owned by main/storage.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Atomic publication and startup cleanup preserve committed bytes and user originals. */
import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, mkdir, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWrite, retryBusy } from './atomic';
import { reconcileLibrary } from './reconcile';
it('publishes complete bytes without leaked temporaries and rejects unsafe destinations', async () => {
  const root=await mkdtemp(join(tmpdir(),'vstudy-atomic-'));
  try {
    const path=join(root,'content.md');await atomicWrite(path,'old');
    await Promise.all([atomicWrite(path,'one'),atomicWrite(path,'two')]);
    expect(['one','two']).toContain(await readFile(path,'utf8'));expect(await readdir(root)).toEqual(['content.md']);
    await expect(atomicWrite(join(root,'missing','content.md'),'new')).rejects.toMatchObject({code:'ENOENT'});
  } finally {await rm(root,{recursive:true,force:true});}
});
it('retries EBUSY but immediately surfaces disk-full and permission errors', async () => {
  const busy=vi.fn().mockRejectedValueOnce(Object.assign(new Error(),{code:'EBUSY'})).mockResolvedValueOnce('ok');
  expect(await retryBusy(busy)).toBe('ok');expect(busy).toHaveBeenCalledTimes(2);
  for (const code of ['ENOSPC','EACCES']) {
    const failure=vi.fn().mockRejectedValue(Object.assign(new Error(),{code}));
    await expect(retryBusy(failure)).rejects.toMatchObject({code});expect(failure).toHaveBeenCalledTimes(1);
  }
});
it('reconciles incomplete imports twice without deleting unknown originals or following symlinks', async () => {
  const root=await mkdtemp(join(tmpdir(),'vstudy-reconcile-'));
  try {
    const hash=join(root,'a'.repeat(64));await mkdir(hash);await mkdir(join(root,'.import-abcd'));
    for (const name of ['source.pdf','content.md','content.md.partial','content.md.12345678.tmp']) await writeFile(join(hash,name),'bytes');
    await symlink('/tmp',join(root,'b'.repeat(64)));
    expect(await reconcileLibrary(root)).toBe(3);expect(await reconcileLibrary(root)).toBe(0);
    expect((await readdir(hash)).sort()).toEqual(['content.md','source.pdf']);
  } finally {await rm(root,{recursive:true,force:true});}
});
