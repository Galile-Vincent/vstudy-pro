/** Storage maintenance preserves original documents, conversation records, and account identity. */
import { readdir, lstat, rm } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { backup } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import type { Store } from '../db';
import type { StorageCategory } from '../../shared/storage';
import { responseCache } from '../cache';
import { MoodleLogoCache } from '../moodle/logos';
import { clearMoodleImages } from '../moodle/files';
import { libraryFiles } from './backup';
import { retryBusy } from './atomic';

/** Count physical files once. Cache bytes are also reported as logical SQLite payload size. */
export async function storageUsage(root:string,store:Store){
  const categories=new Map<StorageCategory,{id:StorageCategory;bytes:number;files:number}>();
  for(const id of ['database','originals','converted','cache','configuration','recovery','other'] as const)categories.set(id,{id,bytes:0,files:0});
  const walk=async(path:string,category?:StorageCategory):Promise<void>=>{
    for(const entry of await readdir(path,{withFileTypes:true})){
      if(entry.isSymbolicLink())continue;
      const file=join(path,entry.name);
      let id=category;
      if(path===root)id=entry.name.startsWith('.restore-') || entry.name.startsWith('.backup-') || /\.bak$/.test(entry.name) ? 'recovery'
        : /^vstudy\.sqlite(?:-wal|-shm)?$/.test(entry.name) ? 'database'
        : ['secrets.json','providers.json','executable-pins.json'].includes(entry.name) ? 'configuration'
        : /cache|converter-venv/i.test(entry.name) ? 'cache' : 'other';
      if(file.startsWith(join(root,'library')+'/'))id=entry.name.startsWith('source.') ? 'originals' : 'converted';
      if(entry.isDirectory())await walk(file,id);
      else if(entry.isFile()){
        const info=await lstat(file).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});if(!info)continue;
        const row=categories.get(id ?? 'other')!;row.bytes+=info.size;row.files++;
      }
    }
  };
  await walk(root);
  const cacheBytes=Number(store.db.prepare('SELECT coalesce(sum(bytes),0) bytes FROM moodle_response_cache').get()?.bytes ?? 0);
  return {categories:[...categories.values()],cacheBytes,pendingRestore:await lstat(join(root,'restore-pending.json')).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;})};
}

/** Clear refetchable responses and thumbnails while retaining courses, reminders, and imported originals. */
export async function clearResponseCache(store:Store,root:string):Promise<void>{
  responseCache(store.db).clear();clearMoodleImages();
  await new MoodleLogoCache(()=>join(root,'moodle','logos')).clear();
  store.db.exec("DELETE FROM moodle_course_details; UPDATE moodle_courses SET data=json_set(data,'$.imageUrl',NULL)");
}

/** Call after all writers settle. Missing converted content remains explicitly retryable. */
export async function clearConverted(root:string,store:Store):Promise<void>{
  const library=join(root,'library');
  for(const name of await libraryFiles(library)){
    if(basename(name).startsWith('source.'))continue;
    const hash=basename(dirname(name));
    const error='VSTUDY_STATUS:'+JSON.stringify({code:'storage.converted_removed',params:{}});
    store.db.exec('SAVEPOINT clear_converted');
    try{
      store.db.prepare("UPDATE documents SET status='failed',error=?,activeVersion='original',aiSizeBytes=NULL,contentChars=NULL WHERE sourceHash=?").run(error,hash);
      store.db.prepare('DELETE FROM document_fts WHERE documentId IN(SELECT id FROM documents WHERE sourceHash=?)').run(hash);
      store.db.prepare('DELETE FROM ai_parse_jobs WHERE documentId IN(SELECT id FROM documents WHERE sourceHash=?)').run(hash);
      store.db.exec('RELEASE clear_converted');
    }catch(e){store.db.exec('ROLLBACK TO clear_converted; RELEASE clear_converted');throw e;}
    await retryBusy(()=>rm(join(root,name),{force:true}));
  }
}

/** Integrity scans run on a snapshot in a worker, keeping SQLite's blocking scan off the main thread. */
export async function checkIntegrity(store:Store,root:string):Promise<{ok:boolean;issues:number}>{
  const stage=await mkdtemp(join(root,'.backup-'));
  try {
    const path=join(stage,'check.sqlite');await backup(store.db,path);
    const {Worker}=await import('node:worker_threads');
    return await new Promise((resolve,reject)=>{
      const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData,{readOnly:true});try{const rows=db.prepare('PRAGMA integrity_check').all();const issues=rows.filter(r=>r.integrity_check!=='ok').length+db.prepare('PRAGMA foreign_key_check').all().length;parentPort.postMessage({ok:issues===0,issues});}finally{db.close();}`,{eval:true,workerData:path});
      let result:{ok:boolean;issues:number}|undefined;
      worker.once('message',value=>{result=value;});worker.once('error',reject);
      worker.once('exit',code=>{if(code || !result)reject(new Error('storage.integrity_failed'));else resolve(result);});
    });
  } finally {await rm(stage,{recursive:true,force:true,maxRetries:3});}
}
