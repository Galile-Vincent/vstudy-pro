/**
 * Regression coverage for ownership.
 * Owned by main.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { acquireOwnership } from './ownership';
it('quits the losing instance and restores and focuses the owner on second launch', () => {
  const calls:string[]=[]; let second: (()=>void)|undefined;
  const window={isMinimized:()=>true,restore:()=>calls.push('restore'),focus:()=>calls.push('focus')};
  const app={requestSingleInstanceLock:()=>false,quit:()=>calls.push('quit'),on:(_event:string,fn:()=>void)=>{second=fn;}};
  expect(acquireOwnership(app,()=>window)).toBe(false);
  expect(calls).toEqual(['quit']);
  app.requestSingleInstanceLock=()=>true;
  expect(acquireOwnership(app,()=>window)).toBe(true);
  second!();expect(calls).toEqual(['quit','restore','focus']);
});
it('keeps MCP background launches hidden and restores a closed owner for ordinary launches', () => {
  let second: ((event?:unknown,argv?:string[])=>void)|undefined;
  let restored=0;
  const app={requestSingleInstanceLock:()=>true,quit:()=>{},on:(_event:string,handler:typeof second)=>{second=handler;}};
  expect(acquireOwnership(app,()=>null,()=>{restored++;})).toBe(true);
  second?.(undefined,['VStudy Pro','--mcp-background']);
  expect(restored).toBe(0);
  second?.(undefined,['VStudy Pro']);
  expect(restored).toBe(1);
});

it('filters background startup while preserving the explicit data directory', async () => {
  const { relaunchArguments } = await import('./ownership');
  expect(relaunchArguments(['electron','app','--mcp-background','--user-data-dir=/owned']))
    .toEqual(['app','--user-data-dir=/owned']);
});
it('releases ownership before asking for a restart', async () => {
  const { restartOwnedApp } = await import('./ownership');
  const calls: string[] = [];
  restartOwnedApp({releaseSingleInstanceLock:()=>{calls.push('release');},
    relaunch:()=>{calls.push('relaunch');},exit:()=>{calls.push('exit');}});
  expect(calls).toEqual(['release','relaunch','exit']);
});
it('exits even if relaunch throws', async () => {
  const { restartOwnedApp } = await import('./ownership');
  const exit = vi.fn();
  expect(() => restartOwnedApp({releaseSingleInstanceLock:vi.fn(),
    relaunch:()=>{throw Error('restart failed');},exit})).toThrow('restart failed');
  expect(exit).toHaveBeenCalledOnce();
});
