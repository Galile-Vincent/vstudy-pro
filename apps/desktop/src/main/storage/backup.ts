/**
 * Validate, export, and stage portable backups without credentials or arbitrary paths.
 * Owned by main/storage.
 * Filesystem operations stay inside the application namespace and preserve recoverable state.
 * @packageDocumentation
 */
/** Portable backups contain SQLite and immutable library files. Secrets and executables are excluded. */
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdtemp, readdir, readFile, rm, mkdir, lstat, rename } from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { isPathWithin, portableBasename } from '../platform/paths';
import { z } from 'zod';
import type { Store } from '../db';
import { openStore } from '../db';
import { validateStudyData } from '../db/study-validation';
import { PlannerRepository } from '../planner/repository';
import { requireFreeSpace } from './space';
import { validateRestoreSchema } from './restore-schema';
import { containedPath } from '../services/file-paths';
import { atomicWrite, syncDirectory } from './atomic';
import { allowedBackupPath, extractZip, fingerprint, writeZip, type ArchiveFile } from './zip';

const manifestSchema=z.object({format:z.literal('vstudy-backup'),version:z.literal(1),createdAt:z.string().datetime(),files:z.array(z.object({
  path:z.string().refine(allowedBackupPath).refine(path=>path!=='manifest.json'),bytes:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()).max(50000)}).strict();
const journalSchema=z.object({directory:z.string().regex(/^\.restore-[a-zA-Z0-9]+$/)}).strict();

/** Enumerate only regular library files inside hash directories. */
export async function libraryFiles(root:string):Promise<string[]> {
  const info=await lstat(root).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
  if(info && (!info.isDirectory() || info.isSymbolicLink()))throw new Error('storage.unsafe_file');
  const files:string[]=[];
  const entries=await readdir(root,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  for(const directory of entries){
    if(!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name))continue;
    for(const file of await readdir(join(root,directory.name),{withFileTypes:true})){
      const name=`library/${directory.name}/${file.name}`;
      if(!allowedBackupPath(name))continue;
      if(!file.isFile() || (await lstat(join(dirname(root),name))).nlink!==1)throw new Error('storage.unsafe_file');
      files.push(name);
    }
  }
  return files.sort();
}

/** Call with writers settled and the IPC maintenance gate held. SQLite backup includes WAL pages. */
export async function exportBackup(store:Store,root:string,destination:string):Promise<void> {
  if(resolve(destination) === resolve(root) || isPathWithin(root,destination))throw new Error('storage.unsafe_file');
  const names=await libraryFiles(join(root,'library'));
  const databaseBytes=Number(store.db.prepare('PRAGMA page_count').get()!.page_count)*Number(store.db.prepare('PRAGMA page_size').get()!.page_size);
  let archiveBytes=databaseBytes+4*1024*1024;
  for(const name of names)archiveBytes+=(await lstat(join(root,name))).size+Buffer.byteLength(name)*2+276;
  // SQLite needs a snapshot; ZIP is stored, with room for its manifest and headers.
  await requireFreeSpace([{path:root,bytes:databaseBytes+8*1024*1024},{path:dirname(destination),bytes:archiveBytes}]);
  const stage=await mkdtemp(join(root,'.backup-'));
  try {
    const snapshot=join(stage,'vstudy.sqlite');await backup(store.db,snapshot);
    const db=new DatabaseSync(snapshot,{readOnly:true});
    try {if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('storage.integrity_failed');}finally{db.close();}
    const files:ArchiveFile[]=[{name:'vstudy.sqlite',path:snapshot,...await fingerprint(snapshot)}];
    for(const name of names)files.push({name,path:join(root,name),...await fingerprint(join(root,name))});
    const inventory=new Map(files.map(file=>[file.name,file]));
    const snapshotDb=new DatabaseSync(snapshot,{readOnly:true});
    try {
      for(const row of snapshotDb.prepare('SELECT sourceHash,sourcePath,status,activeVersion FROM documents').all()){
        const hash=String(row.sourceHash),source=`library/${hash}/${portableBasename(String(row.sourcePath))}`;
        if(inventory.get(source)?.sha256!==hash || row.status==='ready' && !inventory.has(`library/${hash}/content.md`) || row.activeVersion==='ai' && !inventory.has(`library/${hash}/content.ai.md`))throw new Error('storage.invalid_backup');
      }
    } finally {snapshotDb.close();}
    const manifest=manifestSchema.parse({format:'vstudy-backup',version:1,createdAt:new Date().toISOString(),files:files.map(f=>({path:f.name,bytes:f.bytes,sha256:f.sha256}))});
    const path=join(stage,'manifest.json');await atomicWrite(path,JSON.stringify(manifest,null,2));
    files.push({name:'manifest.json',path,...await fingerprint(path)});
    await writeZip(destination,files);
  } finally {await rm(stage,{recursive:true,force:true,maxRetries:3});}
}

/** Validate all hashes, SQLite, schemas, references, and source identities before scheduling a restore. */
export async function stageRestore(root:string,source:string):Promise<void> {
  // Extraction plus SQLite validation/migration WAL and index work coexist with live data.
  await requireFreeSpace([{path:root,bytes:(await lstat(source)).size*3+8*1024*1024}]);
  const stage=await mkdtemp(join(root,'.restore-'));let published=false;
  try {
    const entries=await extractZip(source,stage);
    if(!entries.has('manifest.json') || !entries.has('vstudy.sqlite'))throw new Error('storage.invalid_backup');
    const manifest=manifestSchema.parse(JSON.parse(await readFile(join(stage,'manifest.json'),'utf8')));
    if(manifest.files.length+1!==entries.size || new Set(manifest.files.map(f=>f.path)).size!==manifest.files.length)throw new Error('storage.invalid_backup');
    for(const expected of manifest.files){const actual=entries.get(expected.path);if(!actual || actual.bytes!==expected.bytes || actual.sha256!==expected.sha256)throw new Error('storage.invalid_backup');}
    validateRestoreSchema(join(stage,'vstudy.sqlite'));
    const store=openStore(join(stage,'vstudy.sqlite'));
    try {
      if(store.db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok' || store.db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('storage.integrity_failed');
      store.settings.get();
      store.validateChats();
      new PlannerRepository(store.db).snapshot(true);
      validateStudyData(store.db);
      for(const row of store.db.prepare('SELECT id,sourceHash,sourcePath,markdownPath,status,activeVersion FROM documents').all()){
        const hash=String(row.sourceHash),name=portableBasename(String(row.sourcePath)),original=`library/${hash}/${name}`;
        if(!/^[a-f0-9]{64}$/.test(hash) || !/^source\.[a-z0-9]{1,12}$/.test(name) || entries.get(original)?.sha256!==hash)throw new Error('storage.invalid_backup');
        if(row.status==='ready' && !entries.has(`library/${hash}/content.md`))throw new Error('storage.invalid_backup');
        if(row.activeVersion==='ai' && !entries.has(`library/${hash}/content.ai.md`))throw new Error('storage.invalid_backup');
        containedPath(join(stage,'library'),join(stage,original));
        if(row.status==='ready')containedPath(join(stage,'library'),join(stage,'library',hash,'content.md'));
        store.db.prepare('UPDATE documents SET sourcePath=?,markdownPath=? WHERE id=?').run(join(root,original),join(root,'library',hash,'content.md'),row.id!);
      }
      store.documents.list();
      store.db.exec("DELETE FROM moodle_response_cache; UPDATE moodle_accounts SET data=json_set(data,'$.status','expired'); PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {store.close();}
    await mkdir(join(stage,'library'),{recursive:true,mode:0o700});
    await syncDirectory(stage);
    await atomicWrite(join(root,'restore-pending.json'),JSON.stringify({directory:basename(stage)}));published=true;
  } finally {if(!published)await rm(stage,{recursive:true,force:true,maxRetries:3});}
}
const exists=async(path:string):Promise<boolean>=>lstat(path).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;});

/** Before opening SQLite, roll a prepared restore forward. Each rename is safe to repeat after a crash. */
export async function recoverRestore(root:string):Promise<boolean> {
  const journal=join(root,'restore-pending.json');if(!await exists(journal))return false;
  const {directory}=journalSchema.parse(JSON.parse(await readFile(journal,'utf8')));
  const stage=join(root,directory);
  if(!(await lstat(stage)).isDirectory() || (await lstat(stage)).isSymbolicLink())throw new Error('storage.invalid_backup');
  const previous=join(stage,'previous');await mkdir(previous,{recursive:true,mode:0o700});
  for(const name of ['vstudy.sqlite-wal','vstudy.sqlite-shm','vstudy.sqlite','library']){
    const current=join(root,name),old=join(previous,name),incoming=join(stage,name);
    if(await exists(incoming) || name.endsWith('-wal') || name.endsWith('-shm')){
      if(await exists(current) && !await exists(old))await rename(current,old);
      if(await exists(incoming))await rename(incoming,current);
      await syncDirectory(root);await syncDirectory(stage);await syncDirectory(previous);
    }
  }
  await rename(journal,join(root,'restore-startup.json'));await syncDirectory(root);return true;
}
