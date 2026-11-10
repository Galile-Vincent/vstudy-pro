import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { coordinateDraftClose, createDraftFlush } from './draft-flush';

afterEach(() => vi.useRealTimers());
class Window extends EventEmitter {
 destroyed = false;
 close() {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  this.emit('close', event);
  if (!event.prevented) this.destroyed = true;
 }
 isDestroyed() { return this.destroyed; }
}
it('keeps each window alive until its own renderer acknowledges', async () => {
 const renderer = () => {
  let id = '';
  let ack = () => {};
  const send = vi.fn((value: string) => { id = value; return true; });
  const flush = createDraftFlush({
   send,
   listen: listener => { ack = () => listener(id); return () => {}; },
  });
  return { send, flush, answer: () => ack() };
 };
 const first = new Window();
 const second = new Window();
 const firstRenderer = renderer();
 const secondRenderer = renderer();
 coordinateDraftClose(first, firstRenderer.flush);
 coordinateDraftClose(second, secondRenderer.flush);
 first.close();
 first.close();
 second.close();
 expect(firstRenderer.send).toHaveBeenCalledTimes(1);
 expect(secondRenderer.send).toHaveBeenCalledTimes(1);
 expect(first.destroyed).toBe(false);
 expect(second.destroyed).toBe(false);
 firstRenderer.answer();
 await Promise.resolve();
 await Promise.resolve();
 expect(first.destroyed).toBe(true);
 expect(second.destroyed).toBe(false);
 secondRenderer.answer();
 await Promise.resolve();
 await Promise.resolve();
 expect(second.destroyed).toBe(true);
});
it('destroys a closing window after the bound even with a hung renderer', async () => {
 vi.useFakeTimers();
 const window = new Window();
 coordinateDraftClose(window, createDraftFlush({ send: () => true, listen: () => () => {} }));
 window.close();
 expect(window.destroyed).toBe(false);
 await vi.advanceTimersByTimeAsync(1999);
 expect(window.destroyed).toBe(false);
 await vi.advanceTimersByTimeAsync(1);
 expect(window.destroyed).toBe(true);
});

it('closes immediately if the renderer is unavailable', async () => {
 const window = new Window();
 coordinateDraftClose(window, createDraftFlush({ send: () => false, listen: () => () => {} }));
 window.close();
 await Promise.resolve();
 await Promise.resolve();
 expect(window.destroyed).toBe(true);
});

it('does not ask for writes after application shutdown has already flushed and closed storage', () => {
 const window = new Window();
 const flush = vi.fn();
 coordinateDraftClose(window, flush, () => true);
 window.close();
 expect(window.destroyed).toBe(true);
 expect(flush).not.toHaveBeenCalled();
});
