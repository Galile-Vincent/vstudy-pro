/**
 * Regression coverage for shutdown.
 * Owned by main.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect,it } from 'vitest';
import { coordinateShutdown } from './shutdown';
it('joins reentrant quit and closes the store only after producers and workers exit',async()=>{
 const calls:string[]=[];let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const shutdown=coordinateShutdown({stopWork:async()=>{calls.push('stop IPC, persist chats');await gate;calls.push('producers and workers exited');},flush:()=>{calls.push('flush');},close:()=>{calls.push('close');},quit:()=>{calls.push('quit');},forceExit:()=>{calls.push('forced');}});
 const first=shutdown();expect(shutdown()).toBe(first);expect(calls).toEqual(['stop IPC, persist chats']);release();await first;
 expect(calls).toEqual(['stop IPC, persist chats','producers and workers exited','flush','close','quit']);
});
it('forces exit on failed cleanup rather than closing SQLite under active work',async()=>{
 const calls:string[]=[];await coordinateShutdown({stopWork:async()=>{throw new Error('failure');},flush:()=>calls.push('flush'),close:()=>calls.push('close'),quit:()=>calls.push('quit'),forceExit:()=>calls.push('forced')})();expect(calls).toEqual(['forced']);
});
