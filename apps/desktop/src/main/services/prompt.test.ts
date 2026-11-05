/**
 * Regression coverage for services prompt.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
import { coalescePrompt } from './prompt';
it('shares concurrent consent and allows a later retry', async () => {
  let calls = 0;
  let finish!: (value: number) => void;
  const show = coalescePrompt(async (options: {message:string}) => { expect(options.message).toBe('download'); calls++; return new Promise<number>(resolve => { finish = resolve; }); });
  const first = show({message:'download'}), second = show({message:'download'});
  expect(calls).toBe(1);
  finish(0);
  expect(await Promise.all([first,second])).toEqual([0,0]);
  const retry = show({message:'download'});
  expect(calls).toBe(2);
  finish(1);
  expect(await retry).toBe(1);
});
