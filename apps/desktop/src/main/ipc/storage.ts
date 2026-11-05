/**
 * Register validated storage IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
/** Native dialogs own backup paths. Maintenance is exclusive and destructive actions require confirmation. */
import { app, dialog } from 'electron';
import type { Store } from '../db';
import { storageContract } from '../../shared/storage';
import type { IpcChannel } from '../../shared/ipc';
import type { createIpcRegistrar } from './register';
import { tr } from '../i18n';
import { showAttachedMessage } from '../dialogs';
import { exclusiveStorage, holdStorageUntilRestart } from '../storage/maintenance';
import { exportBackup, stageRestore } from '../storage/backup';
import { storageUsage, clearResponseCache, clearConverted, checkIntegrity } from '../storage/service';

/** Register this subsystem through the validated IPC registrar; return cleanup for window teardown. */
export function registerStorageIpc(registrar:ReturnType<typeof createIpcRegistrar>,store:Store,implemented:Set<IpcChannel>,settle:()=>Promise<void>):void{
  for(const channel of Object.keys(storageContract) as (keyof typeof storageContract)[])implemented.add(channel);
  const root=app.getPath('userData');
  const confirm=async(key:string)=>(await showAttachedMessage({type:'warning',message:tr('storage:'+key),detail:tr('storage:'+key+'_copy'),buttons:[tr('common:cancel'),tr('storage:continue')],defaultId:0,cancelId:0})).response===1;
  registrar.handle('storage:usage',()=>storageUsage(root,store));
  registrar.handle('storage:clearCache',async()=>{if(!await confirm('clear_cache'))return {cancelled:true};await exclusiveStorage(settle,async()=>{await clearResponseCache(store,root);});return {ok:true};});
  registrar.handle('storage:clearConverted',async()=>{if(!await confirm('clear_converted'))return {cancelled:true};await exclusiveStorage(settle,()=>clearConverted(root,store));return {ok:true};});
  registrar.handle('storage:integrity',()=>exclusiveStorage(settle,()=>checkIntegrity(store,root)));
  registrar.handle('storage:export',async()=>{
    const result=await dialog.showSaveDialog({title:tr('storage:export'),defaultPath:'vstudy-backup.zip',filters:[{name:tr('storage:backup_file'),extensions:['zip']}]});
    if(result.canceled || !result.filePath)return {saved:false};
    await exclusiveStorage(settle,()=>exportBackup(store,root,result.filePath!));return {saved:true};
  });
  registrar.handle('storage:restart',()=>{setImmediate(()=>{app.relaunch();app.quit();});return {ok:true};});
  registrar.handle('storage:restore',async()=>{
    const result=await dialog.showOpenDialog({title:tr('storage:restore'),properties:['openFile'],filters:[{name:tr('storage:backup_file'),extensions:['zip']}]});
    if(result.canceled || !result.filePaths[0] || !await confirm('restore'))return {scheduled:false};
    await exclusiveStorage(settle,async()=>{await stageRestore(root,result.filePaths[0]!);holdStorageUntilRestart();});
    return {scheduled:true};
  });
}
