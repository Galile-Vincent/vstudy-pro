import { expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerUsageIpc,usageCsv } from './usage';
import { usageRecordSchema } from '../../shared/domain';
import type { IpcChannel } from '../../shared/ipc';
vi.mock('electron',()=>({dialog:{showSaveDialog:vi.fn(async()=>({canceled:true}))}}));
it('registers usage handlers through trusted sender and strict payload/response validation',async()=>{
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  let trusted=true;
  const registrar=createIpcRegistrar({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:()=>{}},()=>trusted);
  const store=openStore(':memory:');
  try {
    const implemented=new Set<IpcChannel>();registerUsageIpc(registrar,store,implemented);
    expect(implemented.size).toBe(7);
    const invoke=(channel:string,payload:unknown)=>handlers.get(channel)!({} as IpcMainInvokeEvent,payload);
    await expect(invoke('usage:summary',{period:'month'})).resolves.toMatchObject({calls:0,unknownPrices:0});
    await expect(invoke('usage:summary',{period:'month',rawSql:'secret'})).rejects.toThrow();
    await expect(invoke('usage:forConversation',{conversationId:'bad'})).rejects.toThrow();
    await expect(invoke('usage:export',{})).resolves.toEqual({saved:false});
    trusted=false;await expect(invoke('usage:summary',{period:'month'})).rejects.toThrow('Untrusted IPC sender');
  } finally {store.close();registrar.dispose();}
});
it('exports CSV with unknown costs blank and neutralizes spreadsheet formulas',()=>{
  const record=usageRecordSchema.parse({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-11-03T00:00:00Z',providerId:'openai-compatible',modelId:'=DANGEROUS,"model"',kind:'chat',inputTokens:1200,outputTokens:340,costSource:'unknown'});
  const csv=usageCsv([record]);
  expect(csv).toContain('"\'=DANGEROUS,""model"""');expect(csv).toContain('"1200","340","","","","","unknown"');
});

it.each(['=cmd','+cmd','-cmd','@cmd','\tcmd','\rcmd','  =cmd'])('quotes hostile CSV cell %j', modelId=>{
 const record=usageRecordSchema.parse({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-11-03T00:00:00Z',providerId:'openai-compatible',modelId,kind:'chat',inputTokens:0,outputTokens:0,costSource:'unknown'});
 expect(usageCsv([record]).split('\r\n')[1]).toContain(`"'${modelId}"`);
});
