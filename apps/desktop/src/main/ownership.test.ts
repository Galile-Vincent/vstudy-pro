/**
 * Regression coverage for ownership.
 * Owned by main.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
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
