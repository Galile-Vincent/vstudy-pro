import { afterEach, expect, it, vi } from 'vitest';
import { recovery } from './recovery';
afterEach(()=>{vi.useRealTimers();});
it('expires the first recovery without extending it when another is added',async()=>{
 vi.useFakeTimers();const first=vi.fn(),second=vi.fn();
 recovery.add('first',first);vi.advanceTimersByTime(20000);
 recovery.add('second',second);vi.advanceTimersByTime(10000);
 expect(recovery.snapshot().map(entry=>entry.message)).toEqual(['second']);
 await recovery.undo();expect(second).toHaveBeenCalledOnce();expect(first).not.toHaveBeenCalled();
 expect(recovery.snapshot()).toEqual([]);
});
it('never admits an already expired recovery',()=>{
 recovery.add('expired',vi.fn(),Date.now()-1);expect(recovery.snapshot()).toEqual([]);
});
