/** Planner startup tolerates corrupt rows and calendar dialogs use the selected language. */
import { afterEach, expect, it, vi } from 'vitest';
import { registerPlannerIpc } from './planner';
import { seedStudent, id } from '../planner/__fixtures__/student';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { i18n } from '../../shared/i18n';
import type { IpcMainInvokeEvent } from 'electron';
const {save,warning}=vi.hoisted(()=>({save:vi.fn(async()=>({canceled:true})),warning:vi.fn(async()=>({response:0}))}));
vi.mock('electron',()=>({dialog:{showSaveDialog:save},Notification:{isSupported:()=>false}}));
vi.mock('../dialogs',()=>({showAttachedMessage:warning}));
afterEach(async()=>{await i18n.changeLanguage('en');vi.clearAllMocks();});
it.each([['en','Calendar'],['zh-Hant','行事曆'],['ja','カレンダー']])('localizes calendar dialog in %s',async(language,label)=>{
  await i18n.changeLanguage(language);
  const store=openStore(':memory:'),callbacks=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const registrar=createIpcRegistrar({handle:(channel,callback)=>{callbacks.set(channel,callback);},removeHandler:()=>{}},()=>true);
  seedStudent(store);
  const cleanup=registerPlannerIpc(registrar,store,new Set());
  try {await callbacks.get('planner:export-calendar')!({} as IpcMainInvokeEvent,{deadlineIds:[id(3)]});expect(save).toHaveBeenCalledWith(expect.objectContaining({filters:[{name:label,extensions:['ics']}]}));}
  finally{cleanup();registrar.dispose();store.close();}
});
it('starts with a visible warning while skipping corrupt planner rows',async()=>{
  const store=openStore(':memory:');store.db.prepare('INSERT INTO planner_goals VALUES (?,?,?,?,?)').run('00000000-0000-4000-8000-000000000001','',null,null,'active');
  const registrar=createIpcRegistrar({handle:()=>{},removeHandler:()=>{}},()=>true);
  const cleanup=registerPlannerIpc(registrar,store,new Set());
  try {expect(warning).toHaveBeenCalledWith(expect.objectContaining({type:'warning',message:expect.stringContaining('skipped')}));}
  finally{cleanup();registrar.dispose();store.close();}
});
