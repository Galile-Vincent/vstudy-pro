import { expect, it, vi } from 'vitest';
import { clearDeletionSession } from './delete-session';
it('bounds a hung storage clear and still flushes cookies', async () => {
  vi.useFakeTimers();
  try {
    const current = {clearStorageData:vi.fn(() => new Promise<void>(() => {})),
      clearCache:vi.fn(),clearAuthCache:vi.fn(),closeAllConnections:vi.fn(),
      flushStorageData:vi.fn(),cookies:{flushStore:vi.fn()}};
    const pending = clearDeletionSession(current);
    const failed = expect(pending).rejects.toThrow('Session deletion incomplete');
    await vi.advanceTimersByTimeAsync(2001);
    await failed;
    expect(current.cookies.flushStore).toHaveBeenCalledOnce();
  } finally {vi.useRealTimers();}
});
