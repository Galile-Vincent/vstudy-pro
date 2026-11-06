/**
 * Regression coverage for storage backup.
 * Owned by main/storage.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Backups restore on another data root and survive interruptions without touching live data early. */
import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from '../db';
import { documentSchema, conversationSchema, messageSchema } from '../../shared/domain';
import { confirmRestoreStartup, rollbackRestoreStartup } from './restore-startup';
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
    expect(await readFile(join(previous,'library',basename(live.directory),'source.md'),'utf8')).toBe(bytes);
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

it('preserves an existing backup when an original is missing from the live library',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-incomplete-export-')),output=await mkdtemp(join(tmpdir(),'vstudy-backup-output-'));
  const {store,directory}=await fixture(root);const path=join(output,'backup.zip');
  try {
    await exportBackup(store,root,path);const good=await readFile(path);
    await rm(join(directory,'source.md'));
    await expect(exportBackup(store,root,path)).rejects.toThrow('storage.invalid_backup');
    expect(await readFile(path)).toEqual(good);
  }finally{store.close();await rm(root,{recursive:true,force:true});await rm(output,{recursive:true,force:true});}
});

it.each([
  "CREATE TRIGGER stolen_paths AFTER UPDATE OF sourcePath ON documents BEGIN UPDATE documents SET sourcePath='/tmp/private/source.md',markdownPath='/tmp/private/content.md' WHERE id=NEW.id; END",
  "DROP TRIGGER document_fts_delete",
  "CREATE VIEW unexpected AS SELECT * FROM documents",
  "CREATE TABLE unexpected(secret TEXT)",
  "CREATE INDEX unexpected ON documents(title)",
])('rejects an archive with altered schema before path rewrites (%s)',async(sql)=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-schema-'));
  const target=await mkdtemp(join(tmpdir(),'vstudy-schema-target-'));
  const {store}=await fixture(root);
  try {
    store.db.exec(sql);
    const zip=join(target,'crafted.zip');await exportBackup(store,root,zip);
    await expect(stageRestore(target,zip)).rejects.toThrow();
    expect(await readdir(target)).toEqual(['crafted.zip']);
  } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});

it.each([
  "INSERT INTO planner_tasks VALUES ('00000000-0000-4000-8000-000000000001','',NULL,NULL,60,'todo','user',NULL,NULL,'bad','bad')",
  "INSERT INTO planner_exams VALUES ('00000000-0000-4000-8000-000000000001','Exam',NULL,'2030-01-01T00:00:00Z','{}','[]',NULL,'2030-01-01T00:00:00Z')",
  "INSERT INTO planner_goals VALUES ('00000000-0000-4000-8000-000000000001','',NULL,NULL,'active')",
  "INSERT INTO planner_plans VALUES ('00000000-0000-4000-8000-000000000001','Plan','Invalid/Zone',60,'[\"Study\"]','2030-01-01T00:00:00Z')",
  "INSERT INTO planner_blocks VALUES ('00000000-0000-4000-8000-000000000001',NULL,'Study',NULL,NULL,NULL,'bad',30)",
  "INSERT INTO planner_reminders VALUES ('00000000-0000-4000-8000-000000000001','task','bad','bad','Note',0)",
])('rejects corrupt planner records before publishing (%s)',async sql=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-planner-restore-'));
  const target=await mkdtemp(join(tmpdir(),'vstudy-planner-target-'));
  const {store}=await fixture(root);
  try {
    store.db.exec(sql);const zip=join(target,'bad.zip');await exportBackup(store,root,zip);
    await expect(stageRestore(target,zip)).rejects.toThrow();
    expect(await readdir(target)).toEqual(['bad.zip']);
  } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});

it.each(['failure','interrupted-rollback','success'])('recovers startup after restore (%s)',async outcome=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-startup-source-'));
  const target=await mkdtemp(join(tmpdir(),'vstudy-startup-target-'));
  try {
    const original=await fixture(root);const zip=join(target,'backup.zip');
    await exportBackup(original.store,root,zip);original.store.close();
    const previous=await fixture(target);previous.store.settings.set({...previous.store.settings.get(),chatSide:'left'});previous.store.close();
    await stageRestore(target,zip);await recoverRestore(target);
    if(outcome==='success')await confirmRestoreStartup(target);
    if(outcome==='interrupted-rollback') {
      const {directory}=JSON.parse(await readFile(join(target,'restore-startup.json'),'utf8'));
      const stage=join(target,directory);await mkdir(join(stage,'failed'));
      await rename(join(target,'vstudy.sqlite'),join(stage,'failed','vstudy.sqlite'));
      await rename(join(stage,'previous','vstudy.sqlite'),join(target,'vstudy.sqlite'));
    }
    expect(await rollbackRestoreStartup(target)).toBe(outcome!=='success');
    expect(await rollbackRestoreStartup(target)).toBe(false);
    const restored=openStore(join(target,'vstudy.sqlite'));
    try {expect(restored.settings.get().chatSide).toBe(outcome==='success'?'right':'left');expect(await readFile(restored.documents.get(id as never)!.sourcePath,'utf8')).toBe(previous.bytes);} finally {restored.close();}
  } finally {await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});

it('restores a database whose document paths were saved on Windows', async () => {
  const root=await mkdtemp(join(tmpdir(),'vstudy-windows-backup-'));
  const target=await mkdtemp(join(tmpdir(),'vstudy-windows-restore-'));
  const {store,bytes}=await fixture(root);
  try {
    store.db.prepare('UPDATE documents SET sourcePath=?').run('C:\\Users\\Student\\library\\source.md');
    const archive=join(target,'backup.zip');
    await exportBackup(store,root,archive);
    await stageRestore(target,archive);
    await recoverRestore(target);
    const restored=openStore(join(target,'vstudy.sqlite'));
    try {expect(await readFile(restored.documents.get(id as never)!.sourcePath,'utf8')).toBe(bytes);}
    finally {restored.close();}
  } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});

it('restores converted image bytes and their Markdown references', async()=>{
 const root=await mkdtemp(join(tmpdir(),'vstudy-image-source-')),target=await mkdtemp(join(tmpdir(),'vstudy-image-target-'));
 const {store,directory}=await fixture(root);
 try {
  const image=Buffer.from('converted image bytes'),name='image-'+createHash('sha256').update(image).digest('hex')+'.png';
  await writeFile(join(directory,name),image);await writeFile(join(directory,'content.md'),`![figure](${name})`);
  const zip=join(target,'backup.zip');await exportBackup(store,root,zip);await stageRestore(target,zip);await recoverRestore(target);
  const restored=openStore(join(target,'vstudy.sqlite'));
  try {const d=restored.documents.get(id as never)!;expect(await readFile(join(d.markdownPath,'..',name))).toEqual(image);expect(await readFile(d.markdownPath,'utf8')).toContain(name);}
  finally {restored.close();}
 } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it.each(['message','superseded message','deleted conversation'])('rejects domain-invalid %s before scheduling restore',async kind=>{
 const root=await mkdtemp(join(tmpdir(),'vstudy-chat-source-')),target=await mkdtemp(join(tmpdir(),'vstudy-chat-target-'));
 const {store}=await fixture(root);
 try {
  const c=store.conversations.insert(conversationSchema.parse({id:'22222222-2222-4222-a222-222222222222',documentId:id,providerId:'openai-api',modelId:'test',createdAt:new Date().toISOString()}));
  const m=store.messages.insert(messageSchema.parse({id:'33333333-3333-4333-a333-333333333333',conversationId:c.id,role:'user',parts:[{type:'text',text:'hello'}],createdAt:c.createdAt}));
  if(kind==='deleted conversation')store.db.prepare("UPDATE conversations SET options='[]',deletedAt=? WHERE id=?").run(c.createdAt,c.id);
  else store.db.prepare("UPDATE messages SET parts='{}',supersededBy=? WHERE id=?").run(kind==='superseded message'?'replacement':null,m.id);
  const zip=join(target,'backup.zip');await exportBackup(store,root,zip);
  await expect(stageRestore(target,zip)).rejects.toThrow('storage.invalid_backup');
  expect(await readdir(target)).toEqual(['backup.zip']);expect(store.documents.list()).toHaveLength(1);
 } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('restores a legacy v1 inventory with no converted image entries',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vstudy-legacy-source-')),target=await mkdtemp(join(tmpdir(),'vstudy-legacy-target-'));
 const {store,directory,bytes}=await fixture(root);
 try {
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const files=await Promise.all([{name:'vstudy.sqlite',path:join(root,'vstudy.sqlite')},...['source.md','content.md'].map(name=>({name:`library/${basename(directory)}/${name}`,path:join(directory,name)}))].map(async f=>({...f,...await fingerprint(f.path)})));
  const manifest=join(root,'old-manifest.json');await writeFile(manifest,JSON.stringify({format:'vstudy-backup',version:1,createdAt:'2025-01-01T00:00:00Z',files:files.map(f=>({path:f.name,bytes:f.bytes,sha256:f.sha256}))}));
  const zip=join(target,'legacy.zip');await writeZip(zip,[...files,{name:'manifest.json',path:manifest,...await fingerprint(manifest)}]);
  await stageRestore(target,zip);await recoverRestore(target);
  const restored=openStore(join(target,'vstudy.sqlite'));try {const d=restored.documents.get(id as never)!;expect(await readFile(d.markdownPath,'utf8')).toBe(bytes);expect(restored.settings.get().chatSide).toBe('right');}finally{restored.close();}
 } finally {store.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
