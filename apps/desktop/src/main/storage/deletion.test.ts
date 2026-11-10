import { expect, it, vi } from 'vitest';
it('drains accepted requests and exclusive exports while rejecting new work', async () => {
  vi.resetModules();
  const storage = await import('./maintenance');
  const release = storage.enterStorageRequest();
  let done!: () => void;
  const work = storage.exclusiveStorage(async () => {}, () => new Promise<void>(resolve => {done=resolve;}));
  const drain = storage.stopStorageForDeletion();
  let drained = false; void drain.then(() => {drained=true;});
  expect(() => storage.enterStorageRequest()).toThrow('storage.busy');
  release();
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  expect(drained).toBe(false);
  done(); await work; await drain;
  expect(storage.storageBusy()).toBe(true);
  await expect(storage.exclusiveStorage(async () => {}, async () => {})).rejects.toThrow('storage.busy');
});
