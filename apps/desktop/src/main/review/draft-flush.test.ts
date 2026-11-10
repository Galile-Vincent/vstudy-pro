import { afterEach, expect, it, vi } from 'vitest';
import { coordinateShutdown } from '../shutdown';
import { createDraftFlush } from './draft-flush';
afterEach(() => { vi.useRealTimers(); });

function renderer(acknowledge: boolean) {
 let ack: (id: string) => void = () => {};
 const requests: string[] = [];
 return {
  requests,
  io: {
   send: (id: string) => { requests.push(id); return true; },
   listen: (listener: (id: string) => void) => { ack = listener; return () => { ack = () => {}; }; },
  },
  answer: (id = requests.at(-1)!) => { if (acknowledge) ack(id); },
 };
}

it('resolves once the renderer acknowledges that its drafts are written', async () => {
 const fake = renderer(true);
 const pending = createDraftFlush(fake.io, 1000)();
 fake.answer('someone-else');
 fake.answer();
 expect(await pending).toBe('flushed');
});

it('gives up after the bound when the renderer never answers', async () => {
 vi.useFakeTimers();
 const fake = renderer(false);
 const pending = createDraftFlush(fake.io, 1000)();
 await vi.advanceTimersByTimeAsync(1000);
 expect(await pending).toBe('timeout');
});

it('does not wait when there is no renderer to ask', async () => {
 expect(await createDraftFlush({ send: () => false, listen: () => () => {} }, 1000)()).toBe('unavailable');
});

it('asks the renderer to flush before IPC is disposed and the store is closed', async () => {
 const calls: string[] = [];
 const fake = renderer(true);
 const flush = createDraftFlush({ send: id => { calls.push('ask renderer'); return fake.io.send(id); }, listen: fake.io.listen }, 1000);
 const shutdown = coordinateShutdown({
  stopWork: async () => { const pending = flush(); calls.push('waiting'); setTimeout(() => { calls.push('renderer wrote'); fake.answer(); }, 0); await pending; calls.push('dispose IPC'); },
  flush: () => calls.push('flush'), close: () => calls.push('close'), quit: () => calls.push('quit'), forceExit: () => calls.push('forced'),
 });
 await shutdown();
 expect(calls).toEqual(['ask renderer', 'waiting', 'renderer wrote', 'dispose IPC', 'flush', 'close', 'quit']);
});

it('accounts for acknowledged unsaved drafts', async () => {
 let id = '';
 let ack: (id: string, status: 'clean' | 'pending') => void = () => {};
 const pending = createDraftFlush({
  send: request => { id = request; return true; },
  listen: listener => { ack = listener; return () => {}; },
 })();
 ack(id, 'pending');
 expect(await pending).toBe('pending');
});
