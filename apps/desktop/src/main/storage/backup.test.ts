/** Backups restore on another data root and survive interruptions without touching live data early. */
import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from '../db';
import { documentSchema } from '../../shared/domain';
import { exportBackup, stageRestore, recoverRestore } from './backup';
import { clearConverted, checkIntegrity, storageUsage } from './service';
import { exclusiveStorage, enterStorageRequest, storageBusy } from './maintenance';
import { fingerprint, writeZip } from './zip';
const id='11111111-1111-4111-a111-111111111111';
async function fixture(root:string){
  const store=openStore(join(root,'vstudy.sqlite'));
  const bytes='Original coursework 資料',hash=createHash('sha256').update(bytes).digest('hex'),directory=join(root,'library',hash);
  await mkdir(directory,{recursive:true});await writeFile(join(directory,'source.md'),bytes);await writeFile(join(directory,'content.md'),bytes);
  store.documents.insert(documentSchema.parse({id,title:'Coursework',sourceHash:hash,sourceName:'course.md',sourcePath:join(directory,'source.md'),markdownPath:join(directory,'content.md'),mime:'text/markdown',status:'ready',createdAt:new Date().toISOString()}));
  store.settings.set({...store.settings.get(),chatSide:'right'});
  return {store,directory,bytes};
}
it.each(['none','database-moved','database-published','library-moved'])('round-trips a portable backup after crash at %s',async(crash)=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-backup-test-'));const target=await mkdtemp(join(tmpdir(),'vstudy-restore-test-'));
  try{
    const {store,bytes}=await fixture(root);const destination=join(target,'backup.zip');await exportBackup(store,root,destination);store.close();
    const live=await fixture(target);live.store.settings.set({...live.store.settings.get(),chatSide:'left'});live.store.close();
    await stageRestore(target,destination);
    const before=openStore(join(target,'vstudy.sqlite'));expect(before.settings.get().chatSide).toBe('left');before.close();
    const journal=JSON.parse(await readFile(join(target,'restore-pending.json'),'utf8'));const stage=join(target,journal.directory),previous=join(stage,'previous');await mkdir(previous);
    if(crash!=='none')await rename(join(target,'vstudy.sqlite'),join(previous,'vstudy.sqlite'));
    if(crash==='database-published' || crash==='library-moved')await rename(join(stage,'vstudy.sqlite'),join(target,'vstudy.sqlite'));
    if(crash==='library-moved')await rename(join(target,'library'),join(previous,'library'));
    expect(await recoverRestore(target)).toBe(true);expect(await recoverRestore(target)).toBe(false);
    const restored=openStore(join(target,'vstudy.sqlite'));
    try {expect(restored.settings.get().chatSide).toBe('right');const document=restored.documents.get(id as never)!;expect(document.sourcePath.startsWith(target)).toBe(true);expect(await readFile(document.sourcePath,'utf8')).toBe(bytes);expect(await checkIntegrity(restored,target)).toEqual({ok:true,issues:0});}
    finally{restored.close();}
    expect(await readFile(join(previous,'library',live.directory.split('/').at(-1)!,'source.md'),'utf8')).toBe(bytes);
  }finally{await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('rejects corrupted bytes, an invalid manifest, duplicate paths and traversal without replacing live data',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-invalid-backup-'));
  try {
    const {store}=await fixture(root);const path=join(tmpdir(),`vstudy-${Date.now()}.zip`);
    try {
      await exportBackup(store,root,path);const bytes=await readFile(path);bytes[60]=bytes[60]! ^ 1;await writeFile(path,bytes);
      await expect(stageRestore(root,path)).rejects.toThrow();expect(store.documents.list()).toHaveLength(1);
      const manifest=join(root,'invalid.json');await writeFile(manifest,'{}');const entry={name:'manifest.json',path:manifest,...await fingerprint(manifest)};
      await writeZip(path,[entry]);await expect(stageRestore(root,path)).rejects.toThrow('invalid_backup');
      await writeZip(path,[entry,entry]);await expect(stageRestore(root,path)).rejects.toThrow();
      await expect(writeZip(path,[{...entry,name:'../escape'}])).rejects.toThrow('invalid_backup');
      expect((await readdir(root)).some(name=>name.startsWith('.restore-'))).toBe(false);
    } finally {store.close();await rm(path,{force:true});}
  }finally{await rm(root,{recursive:true,force:true});}
});
it('clears generated content while preserving originals and marking documents retryable',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-clear-converted-'));
  const {store,directory,bytes}=await fixture(root);
  try {
    expect((await storageUsage(root,store)).categories.find(c=>c.id==='originals')?.bytes).toBe(Buffer.byteLength(bytes));
    await clearConverted(root,store);await clearConverted(root,store);
    expect(await readFile(join(directory,'source.md'),'utf8')).toBe(bytes);expect(await readdir(directory)).toEqual(['source.md']);
    expect(store.documents.get(id as never)).toMatchObject({status:'failed',activeVersion:'original'});
    expect((await checkIntegrity(store,root)).ok).toBe(true);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
it('drains accepted IPC before maintenance and rejects concurrent work until completion',async()=>{
  const release=enterStorageRequest();let ran=false;
  const pending=exclusiveStorage(async()=>{},async()=>{ran=true;expect(storageBusy()).toBe(true);});
  expect(()=>enterStorageRequest()).toThrow('storage.busy');await Promise.resolve();expect(ran).toBe(false);
  release();await pending;expect(ran).toBe(true);expect(storageBusy()).toBe(false);
});
