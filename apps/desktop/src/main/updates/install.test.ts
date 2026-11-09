import {EventEmitter} from 'node:events';
import {expect, it, vi} from 'vitest';
import {cancellableInstall} from './install';
it.each([false,true])('removes only attempt completion listeners after cancellation (synchronous error: %s)', synchronous => {
  const native = new EventEmitter(), quit = vi.fn(), existing = vi.fn();
  native.on('update-downloaded', existing);
  const updater = {quitAndInstall:() => {
    native.on('update-downloaded', quit);
    if (synchronous) adapter.cancelInstall();
  }};
  const adapter = cancellableInstall(updater,native);
  adapter.quitAndInstall(); adapter.cancelInstall();
  native.emit('update-downloaded');
  expect(quit).not.toHaveBeenCalled(); expect(existing).toHaveBeenCalledOnce();
  adapter.quitAndInstall();
  expect(native.listenerCount('update-downloaded')).toBe(synchronous ? 1 : 2);
});
