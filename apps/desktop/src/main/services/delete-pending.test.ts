import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataDeletion, finishPendingDeletion } from './delete-data';
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return {...actual, rename:vi.fn(actual.rename), rm:vi.fn(actual.rm)};
});
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, {recursive:true,force:true}); });
async function fixture() {
  const parent = await fs.mkdtemp(join(tmpdir(), 'delete-pending-')); roots.push(parent);
  const root = join(parent, 'profile'); await fs.mkdir(root);
  await fs.writeFile(join(root, 'vstudy.sqlite'), 'private');
  return {root,parent};
}
it('removes interrupted atomic writes of private configuration', async () => {
  const {root} = await fixture();
  const name = 'secrets.json.12345678-1234-1234-1234-123456789abc.tmp';
  await fs.writeFile(join(root,name),'private');
  await fs.writeFile(root + '.delete-pending','{}');
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(true);
  await expect(fs.access(join(root,name))).rejects.toThrow();
});
it.each(['EPERM', 'EBUSY'])('durably schedules a wipe after %s', async code => {
  const {root} = await fixture();
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(Error(code), {code}));
  await createDataDeletion(root, async () => {}, async () => {}, () => {})();
  expect(JSON.parse(await fs.readFile(root + '.delete-pending', 'utf8'))).toMatchObject({token:expect.any(String),timestamp:expect.any(Number)});
});
it('retries partial deletion after a crash and does not follow owned symlinks', async () => {
  const {root,parent} = await fixture();
  await fs.writeFile(join(parent, 'outside'), 'keep');
  await fs.symlink(parent, join(root, 'library'));
  await fs.writeFile(root + '.delete-pending', '{}');
  const clear = vi.fn().mockRejectedValueOnce(Error('crash')).mockResolvedValue(undefined);
  const log = vi.fn();
  expect(await finishPendingDeletion(root, clear, log)).toBe(false);
  await fs.access(root + '.delete-pending');
  expect(await fs.readFile(join(parent,'outside'),'utf8')).toBe('keep');
  expect(await finishPendingDeletion(root, clear, log)).toBe(true);
  await expect(fs.access(root + '.delete-pending')).rejects.toThrow();
  expect(await finishPendingDeletion(root, clear, log)).toBe(true);
  expect(clear).toHaveBeenCalledTimes(2);
});
it('leaves a failed owned entry pending and retries with bounded filesystem retries', async () => {
  const {root} = await fixture(); await fs.writeFile(root + '.delete-pending', '{}');
  const original = (await vi.importActual<typeof fs>('node:fs/promises')).rm;
  const remove = vi.spyOn(fs, 'rm').mockImplementationOnce(async () => {throw Error('locked');});
  expect(await finishPendingDeletion(root, async () => {}, vi.fn())).toBe(false);
  expect(remove).toHaveBeenCalledWith(join(await fs.realpath(root),'vstudy.sqlite'),expect.objectContaining({maxRetries:5,retryDelay:200}));
  remove.mockImplementation(original);
  expect(await finishPendingDeletion(root, async () => {}, vi.fn())).toBe(true);
});
it('wipes the resolved symlink root instead of quarantining only the link', async () => {
  const {root,parent} = await fixture();
  const link = join(parent,'linked'); await fs.symlink(root,link);
  await createDataDeletion(link, async () => {}, async () => {}, () => {})();
  await fs.access(link + '.delete-pending');
  expect(await finishPendingDeletion(link,async () => {},vi.fn())).toBe(true);
  await expect(fs.access(join(root,'vstudy.sqlite'))).rejects.toThrow();
});

it('uses deferred deletion directly on Windows without renaming the root', async () => {
  const {root} = await fixture();
  const platform = Object.getOwnPropertyDescriptor(process,'platform')!;
  try {
    Object.defineProperty(process,'platform',{value:'win32',configurable:true});
    const rename = vi.spyOn(fs,'rename'); rename.mockClear();
    await createDataDeletion(root,async () => {},async () => {},() => {})();
    expect(rename).not.toHaveBeenCalled();
    await fs.access(root + '.delete-pending');
  } finally { Object.defineProperty(process,'platform',platform); }
});
it('clears every persisted partition and deletes unknown profile entries', async () => {
  const {root} = await fixture();
  await fs.mkdir(join(root,'Partitions','moodle-old'),{recursive:true});
  await fs.mkdir(join(root,'converter-python'));
  await fs.writeFile(join(root,'unknown'),'keep');
  await fs.writeFile(root + '.delete-pending','{}');
  const clear = vi.fn();
  expect(await finishPendingDeletion(root,clear,vi.fn())).toBe(true);
  expect(clear).toHaveBeenCalledWith(['moodle-old']);
  await expect(fs.access(join(root,'converter-python'))).rejects.toThrow();
  await expect(fs.access(join(root,'unknown'))).rejects.toThrow();
});

it('deletes all writer artifacts and unknown entries except Chromium bookkeeping', async () => {
  const {root} = await fixture();
  const removed = ['vstudy.sqlite.before-v7.bak',
    'vstudy.sqlite.before-v8.bak.12345678-1234-1234-1234-123456789abc.tmp',
    'logs', 'mcp', 'review', 'library', 'ai-tools', 'converter-venv',
    'window-state.json', 'analytics-queue.json', 'secrets.json', 'providers.json', 'unknown'];
  const kept = ['Local State', 'lockfile', 'SingletonLock', 'SingletonCookie',
    'SingletonSocket', 'Network', 'Preferences'];
  for (const name of [...removed, ...kept]) await fs.writeFile(join(root,name),'private');
  await fs.writeFile(root + '.delete-pending','{}');
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(true);
  for (const name of removed) await expect(fs.access(join(root,name))).rejects.toThrow();
  for (const name of kept) await fs.access(join(root,name));
});
