/**
 * Regression coverage for moodle scheduler.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
import { MoodleScheduler } from './scheduler';
it('bounds concurrency and moves visible requests ahead of queued background work',async () => {
  const scheduler=new MoodleScheduler(2);
  const order:string[]=[];
  let release!:()=>void;
  const gate=new Promise<void>(resolve => {release=resolve;});
  const work=(name:string,priority=0) => scheduler.run(priority,async () => {order.push(name);await gate;return name;});
  const pending=[work('a'),work('b'),work('background'),work('visible',10),work('next',10)];
  expect(order).toEqual(['a','b']);
  release();
  expect(await Promise.all(pending)).toEqual(['a','b','background','visible','next']);
  expect(order).toEqual(['a','b','visible','next','background']);
});
it('releases capacity after failures',async () => {
  const scheduler=new MoodleScheduler(1);
  const failed=scheduler.run(0,async () => {throw new Error('offline');});
  const next=scheduler.run(0,async () => 42);
  await expect(failed).rejects.toThrow('offline');
  expect(await next).toBe(42);
});
