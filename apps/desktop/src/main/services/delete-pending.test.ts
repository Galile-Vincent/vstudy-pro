import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataDeletion, finishPendingDeletion, markDeletionPending } from './delete-data';
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return {...actual, rename:vi.fn(actual.rename), rm:vi.fn(actual.rm)};
});
const platform = Object.getOwnPropertyDescriptor(process,'platform')!;
const roots: string[] = [];
afterEach(async () => { Object.defineProperty(process,'platform',platform); vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, {recursive:true,force:true}); });
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
  await fs.writeFile(root + '.delete-pending',JSON.stringify({timestamp:Date.now()}));
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(true);
  await expect(fs.access(join(root,name))).rejects.toThrow();
});
it.each(['darwin','win32'].flatMap(platform => ['EPERM','EBUSY'].map(code => ({platform,code}))))(
  'durably schedules a wipe after $code on $platform', async ({platform,code}) => {
  const {root} = await fixture();
  const target = await fs.realpath(root);
  Object.defineProperty(process,'platform',{value:platform,configurable:true});
  const actual = await vi.importActual<typeof fs>('node:fs/promises');
  const failure = Object.assign(Error(code),{code});
  const rename = vi.spyOn(fs,'rename'); rename.mockClear();
  const remove = vi.spyOn(fs,'rm');
  if (platform === 'win32') {
    remove.mockImplementation(async (path,options) => {
      if (String(path) === join(target,'vstudy.sqlite')) throw failure;
      return actual.rm(path,options);
    });
  } else rename.mockRejectedValueOnce(failure);
  const report = vi.fn(), relaunch = vi.fn();
  await createDataDeletion(root, async () => {}, report, relaunch)();
  expect(JSON.parse(await fs.readFile(root + '.delete-pending', 'utf8'))).toMatchObject({token:expect.any(String),timestamp:expect.any(Number)});
  expect(report).toHaveBeenCalledWith(failure,true);
  expect(relaunch).toHaveBeenCalledOnce();
  await fs.access(join(root,'vstudy.sqlite'));
  if (platform === 'win32') expect(rename).not.toHaveBeenCalled();
  else expect(rename).toHaveBeenCalledOnce();
  remove.mockImplementation(actual.rm);
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(true);
  await expect(fs.access(join(root,'vstudy.sqlite'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(fs.access(root+'.delete-pending')).rejects.toMatchObject({code:'ENOENT'});
});
it('retries partial deletion after a crash and does not follow owned symlinks', async () => {
  const {root,parent} = await fixture();
  await fs.writeFile(join(parent, 'outside'), 'keep');
  await fs.symlink(parent, join(root, 'library'));
  await fs.writeFile(root + '.delete-pending', JSON.stringify({timestamp:Date.now()}));
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
  const {root} = await fixture(); await fs.writeFile(root + '.delete-pending', JSON.stringify({timestamp:Date.now()}));
  const original = (await vi.importActual<typeof fs>('node:fs/promises')).rm;
  const remove = vi.spyOn(fs, 'rm').mockRejectedValue(Error('locked'));
  expect(await finishPendingDeletion(root, async () => {}, vi.fn())).toBe(false);
  expect(remove).toHaveBeenCalledWith(join(await fs.realpath(root),'vstudy.sqlite'),expect.objectContaining({maxRetries:5,retryDelay:200}));
  remove.mockImplementation(original);
  expect(await finishPendingDeletion(root, async () => {}, vi.fn())).toBe(true);
});
it('wipes the resolved symlink root instead of quarantining only the link', async () => {
  const {root,parent} = await fixture();
  const link = join(parent,'linked'); await fs.symlink(root,link);
  await createDataDeletion(link, async () => {}, async () => {}, () => {})();
  await expect(fs.access(join(root,'vstudy.sqlite'))).rejects.toThrow();
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
    await expect(fs.access(join(root,'vstudy.sqlite'))).rejects.toThrow();
  } finally { Object.defineProperty(process,'platform',platform); }
});
it('clears every persisted partition and deletes unknown profile entries', async () => {
  const {root} = await fixture();
  await fs.mkdir(join(root,'Partitions','moodle-old'),{recursive:true});
  await fs.mkdir(join(root,'converter-python'));
  await fs.writeFile(join(root,'unknown'),'keep');
  await fs.writeFile(root + '.delete-pending',JSON.stringify({timestamp:Date.now()}));
  const clear = vi.fn();
  expect(await finishPendingDeletion(root,clear,vi.fn())).toBe(true);
  expect(clear).toHaveBeenCalledWith([]);
  await expect(fs.access(join(root,'Partitions'))).rejects.toThrow();
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
  await fs.writeFile(root + '.delete-pending',JSON.stringify({timestamp:Date.now()}));
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(true);
  for (const name of removed) await expect(fs.access(join(root,name))).rejects.toThrow();
  for (const name of kept) await fs.access(join(root,name));
});

it('continues past a locked converter and prioritizes secrets and migration copies', async () => {
  const {root} = await fixture();
  for (const name of ['converter-venv','secrets.json','providers.json','vstudy.sqlite.before-v2.bak']) {
    await fs.writeFile(join(root,name),'private');
  }
  await fs.writeFile(root + '.delete-pending',JSON.stringify({timestamp:Date.now()}));
  const actual = await vi.importActual<typeof fs>('node:fs/promises');
  const remove = vi.spyOn(fs,'rm').mockImplementation(async (path, options) => {
    if (String(path).endsWith('converter-venv')) throw Error('locked');
    return actual.rm(path,options);
  });
  remove.mockClear();
  expect(await finishPendingDeletion(root,async () => {},vi.fn())).toBe(false);
  for (const name of ['secrets.json','providers.json','vstudy.sqlite','vstudy.sqlite.before-v2.bak']) {
    await expect(fs.access(join(root,name))).rejects.toThrow();
  }
  expect(remove.mock.calls[0]?.[0]).toBe(join(await fs.realpath(root),'providers.json'));
});

it('ignores an expired marker without wiping newer data', async () => {
  const {root} = await fixture();
  await fs.writeFile(root + '.delete-pending',JSON.stringify({timestamp:Date.now()-86_400_001}));
  const log=vi.fn();
  expect(await finishPendingDeletion(root,vi.fn(),log)).toBe(false);
  await fs.access(join(root,'vstudy.sqlite'));
  expect(log).toHaveBeenCalledWith(expect.objectContaining({phase:'delete-marker-expired'}));
});
it('never follows or overwrites a marker symlink', async () => {
  const {root,parent} = await fixture();
  const outside=join(parent,'outside'); await fs.writeFile(outside,'keep');
  await fs.symlink(outside,root + '.delete-pending');
  await expect(markDeletionPending(root)).rejects.toThrow();
  expect(await fs.readFile(outside,'utf8')).toBe('keep');
  expect(await finishPendingDeletion(root,vi.fn(),vi.fn())).toBe(false);
  await fs.access(join(root,'vstudy.sqlite'));
});
it('retries marker removal after a transient lock', async () => {
  const {root} = await fixture(); await markDeletionPending(root);
  const actual=await vi.importActual<typeof fs>('node:fs/promises');
  let attempts=0;
  vi.spyOn(fs,'rm').mockImplementation(async (path,options) => {
    if (String(path)===root+'.delete-pending' && attempts++===0) throw Error('locked');
    return actual.rm(path,options);
  });
  expect(await finishPendingDeletion(root,vi.fn(),vi.fn())).toBe(true);
  expect(attempts).toBe(2);
});
