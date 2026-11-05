/** Cancelled native confirmations never acknowledge storage cleanup as completed. */
import { expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerStorageIpc } from './storage';
vi.mock('electron',()=>({app:{getPath:()=>'/unused'},dialog:{}}));
vi.mock('../dialogs',()=>({showAttachedMessage:async()=>({response:0})}));
it.each(['storage:clearCache','storage:clearConverted'])('returns cancelled without settling or modifying storage for %s',async channel=>{
  const store=openStore(':memory:'),callbacks=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const registrar=createIpcRegistrar({handle:(channel,callback)=>{callbacks.set(channel,callback);},removeHandler:()=>{}},()=>true);
  const settle=vi.fn();registerStorageIpc(registrar,store,new Set(),settle);
  try {expect(await callbacks.get(channel)!({} as IpcMainInvokeEvent,{})).toEqual({cancelled:true});expect(settle).not.toHaveBeenCalled();}
  finally {registrar.dispose();store.close();}
});
