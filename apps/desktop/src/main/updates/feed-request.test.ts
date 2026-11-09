import {EventEmitter} from 'node:events';
import {expect, it, vi} from 'vitest';
import {cappedExecutor} from './feed-request';
it('aborts streaming metadata at 64 KiB before buffering more', () => {
  const response = new EventEmitter();
  const abort = vi.fn(), failed = vi.fn(), buffered = vi.fn();
  response.on('error', failed);
  const executor = cappedExecutor({createRequest:(_options:unknown, callback:(value:unknown)=>void) => {
    queueMicrotask(() => callback(response)); return {abort};
  }} as never);
  executor.createRequest({}, value => value.on('data', buffered));
  return new Promise<void>(resolve => queueMicrotask(() => {
    response.emit('data', Buffer.alloc(65536));
    expect(abort).not.toHaveBeenCalled();
    response.emit('data', Buffer.alloc(1));
    expect(abort).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledOnce();
    response.emit('data', Buffer.alloc(65536));
    expect(buffered).toHaveBeenCalledTimes(2); resolve();
  }));
});
