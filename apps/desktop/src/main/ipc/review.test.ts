import { afterEach,expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
vi.mock('electron',()=>({app:{getPath:()=>'/tmp/review-test'}}));
import { openStore } from '../db';
import { createIpcRegistrar,channelPolicy } from './register';
import { registerReviewIpc } from './review';
import { reviewIpc } from '../../shared/review';
import type { IpcChannel } from '../../shared/ipc';
import { reviewWorkers } from '../review/workers';
const stores:ReturnType<typeof openStore>[]=[];
afterEach(()=>stores.splice(0).forEach(store=>store.close()));
it('registers every bounded review channel and drains privacy workers before erasing',async()=>{
 const store=openStore(':memory:');stores.push(store);
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const registrar=createIpcRegistrar({handle:(channel,listener)=>{handlers.set(channel,listener);},removeHandler:channel=>{handlers.delete(channel);}},()=>true);
 const implemented=new Set<IpcChannel>();const repo=registerReviewIpc(registrar,store,implemented);
 expect(Object.keys(reviewIpc).every(channel=>implemented.has(channel as IpcChannel)&&handlers.has(channel))).toBe(true);
 const invoke=(channel:string,input:unknown)=>handlers.get(channel)!({} as IpcMainInvokeEvent,input);
 await expect(invoke('review:courses:list',{limit:101})).rejects.toThrow();
 const course=repo.createCourse({title:'Physics'});const calls:string[]=[];
 let settle!:()=>void;const pending=new Promise<void>(resolve=>{settle=resolve;});
 const unregister=reviewWorkers.register({suspend(){calls.push('suspend');},resume(){calls.push('resume');},async waitForIdle(){calls.push('idle');await pending;},dispose(){}});
 try{const erased=invoke('review:prefs:erase',{});await Promise.resolve();expect(calls).toEqual(['suspend','idle']);expect(repo.getCourse(course.id)).not.toBeNull();settle();await erased;expect(repo.getCourse(course.id)).toBeNull();expect(repo.getPrefs().memoryEnabled).toBe(false);await invoke('review:prefs:set',{memoryEnabled:true});expect(calls.at(-1)).toBe('resume');}finally{settle();unregister();reviewWorkers.resume('privacy');registrar.dispose();}
 expect(channelPolicy('review:artifact:generate').requests).toBe(12);
 expect(channelPolicy('review:jobs:retry').requests).toBe(12);
});
