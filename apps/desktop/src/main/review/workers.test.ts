import { expect, it, vi } from 'vitest';
import { ReviewWorkerRegistry } from './workers';
it('fences workers, drains them before disposal and preserves independent suspension reasons', async () => { const registry = new ReviewWorkerRegistry(); const worker = { suspend: vi.fn(), resume: vi.fn(), waitForIdle: vi.fn(async () => { }), dispose: vi.fn(async () => { }) }; registry.suspend('privacy'); registry.register(worker); expect(worker.suspend).toHaveBeenCalledOnce(); registry.suspend('storage'); registry.resume('storage'); expect(worker.resume).not.toHaveBeenCalled(); await registry.waitForIdle(); expect(worker.waitForIdle).toHaveBeenCalledOnce(); registry.resume('privacy'); expect(worker.resume).toHaveBeenCalledOnce(); await registry.dispose(); expect(worker.dispose).toHaveBeenCalledOnce(); expect(() => registry.register(worker)).toThrow(); });

it('storage maintenance drains workers before snapshotting and resumes after failure',async()=>{
 const {reviewWorkers}=await import('./workers');const {exclusiveStorage}=await import('../storage/maintenance');const calls:string[]=[];
 const remove=reviewWorkers.register({suspend(){calls.push('suspend');},resume(){calls.push('resume');},async waitForIdle(){calls.push('idle');},dispose(){}});
 try{await expect(exclusiveStorage(async()=>{calls.push('settle');},async()=>{calls.push('work');throw new Error('snapshot');})).rejects.toThrow('snapshot');expect(calls).toEqual(['suspend','idle','settle','work','resume']);}finally{remove();}
});

it('keeps review workers suspended when restore holds storage until restart',async()=>{
 const {reviewWorkers}=await import('./workers');const {exclusiveStorage,holdStorageUntilRestart}=await import('../storage/maintenance');const worker={suspend:vi.fn(),resume:vi.fn(),waitForIdle:vi.fn(async()=>{}),dispose:vi.fn()};const remove=reviewWorkers.register(worker);
 try{await exclusiveStorage(async()=>{},async()=>{holdStorageUntilRestart();});expect(worker.suspend).toHaveBeenCalledOnce();expect(worker.waitForIdle).toHaveBeenCalledOnce();expect(worker.resume).not.toHaveBeenCalled();}finally{remove();}
});
