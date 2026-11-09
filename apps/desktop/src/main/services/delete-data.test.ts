import { expect, it, vi } from 'vitest';
import { deleteAllData } from './delete-data';
const rm = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({rm,access:vi.fn().mockRejectedValue(new Error('missing'))}));
it('keeps the app running and identifies removal failures', async () => {
  rm.mockRejectedValueOnce(Object.assign(new Error('locked'),{code:'EACCES'}));
  const stop = vi.fn();
  await expect(deleteAllData('/owned',stop)).rejects.toThrow('settings.delete_failed');
  expect(stop).not.toHaveBeenCalled();
});
