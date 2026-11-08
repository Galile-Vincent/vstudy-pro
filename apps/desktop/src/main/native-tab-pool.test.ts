import { expect, it, vi } from 'vitest';
import { NativeTabPool, NATIVE_IDLE_MS, NATIVE_MEMORY_HIGH, type NativeResource } from './native-tab-pool';
const resource = (key: string, extra: Partial<NativeResource> = {}): NativeResource => ({ key, ownerId: 1, kind: 'moodle', lastActiveAt: Number(key), active: () => false, protected: () => false, processId: () => Number(key), discard: vi.fn(), ...extra });
it('evicts the hidden LRU before allocating and counts protected views', () => {
  const pool = new NativeTabPool();
  const views = ['1','2','3','4'].map(key => resource(key));
  views.forEach(view => pool.acquire(view));
  pool.touch('1');
  expect(pool.acquire(resource('5'))).toBe('ready');
  expect(views[1]!.discard).toHaveBeenCalledOnce();
  expect(pool.size).toBe(4);
});
it('refuses allocation when all views are protected or active', () => {
  const pool = new NativeTabPool();
  for (let i=0;i<4;i++) pool.acquire(resource(String(i), i%2 ? {active:()=>true} : {protected:()=>true}));
  expect(pool.acquire(resource('5'))).toBe('resource-limit');
  expect(pool.size).toBe(4);
});
it('discards idle safe resources with an injected clock', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const pool = new NativeTabPool();
  const view = resource('0'); pool.acquire(view);
  vi.advanceTimersByTime(NATIVE_IDLE_MS); pool.evaluate([]);
  expect(view.discard).toHaveBeenCalledOnce(); vi.useRealTimers();
});
it('deduplicates process memory and evicts chat first above the high threshold', () => {
  const pool = new NativeTabPool(() => 0);
  const moodle = resource('1'), chat = resource('2',{kind:'web-chat'});
  pool.acquire(moodle); pool.acquire(chat);
  pool.evaluate([{pid:1,memory:{workingSetSize:NATIVE_MEMORY_HIGH/1024/2}},{pid:2,memory:{workingSetSize:NATIVE_MEMORY_HIGH/1024/2}}]);
  expect(chat.discard).not.toHaveBeenCalled();
  pool.evaluate([{pid:1,memory:{workingSetSize:600*1024}},{pid:2,memory:{workingSetSize:600*1024}}]);
  expect(chat.discard).toHaveBeenCalledOnce(); expect(moodle.discard).not.toHaveBeenCalled();
});
it('applies the cap independently to each window',()=>{
  const pool=new NativeTabPool();
  for(let index=0;index<8;index++) expect(pool.acquire(resource(String(index),{ownerId:index<4?1:2,active:()=>true}))).toBe('ready');
  expect(pool.size).toBe(8);
  expect(pool.acquire(resource('9',{ownerId:1}))).toBe('resource-limit');
});
it('does not count a shared native process twice or evict protected work under pressure',()=>{
  const pool=new NativeTabPool(()=>0);
  const first=resource('1',{processId:()=>9}),second=resource('2',{processId:()=>9,protected:()=>true});
  pool.acquire(first);pool.acquire(second);
  pool.evaluate([{pid:9,memory:{workingSetSize:700*1024}}]);
  expect(first.discard).not.toHaveBeenCalled();
  pool.evaluate([{pid:9,memory:{workingSetSize:1100*1024}}]);
  expect(first.discard).toHaveBeenCalledOnce();
  expect(second.discard).not.toHaveBeenCalled();
});
it('tolerates a process destroyed between metric ticks',()=>{
 const pool=new NativeTabPool(()=>0);pool.acquire(resource('1',{processId:()=>{throw new Error('destroyed');}}));
 expect(()=>pool.evaluate([])).not.toThrow();
});
