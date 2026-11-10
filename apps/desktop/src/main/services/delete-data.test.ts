import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { createDataDeletion, cleanupDeletedData } from './delete-data';
const io = vi.hoisted(() => ({rename:vi.fn(),rm:vi.fn(),readdir:vi.fn(),open:vi.fn(),lstat:vi.fn(),realpath:vi.fn()}));
const workers = vi.hoisted(() => ({suspend:vi.fn(),waitForIdle:vi.fn(),resume:vi.fn()}));
vi.mock('node:fs/promises', () => io);
// Fake filesystem paths must use Windows semantics during the forced run too.
vi.mock('node:path', async importOriginal => {
  const actual = await importOriginal<typeof import('node:path')>();
  return process.platform === 'win32' ? {...actual, ...actual.win32} : actual;
});
vi.mock('../review/workers', () => ({reviewWorkers:workers}));
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const root = join(process.platform === 'win32' ? 'C:\\Users\\Study' : '/', 'owned');
afterEach(() => { Object.defineProperty(process, 'platform', platform); });
// These cases specify the POSIX atomic-quarantine contract, even on Windows hosts.
beforeEach(() => {Object.defineProperty(process,'platform',{value:'darwin',configurable:true}); vi.resetAllMocks(); io.realpath.mockResolvedValue(root); io.readdir.mockResolvedValue([]); io.lstat.mockResolvedValue({isSymbolicLink:()=>false,isDirectory:()=>true}); io.open.mockResolvedValue({writeFile:vi.fn(),sync:vi.fn(),close:vi.fn()});});
function setup() {
  const stop=vi.fn(), report=vi.fn(), relaunch=vi.fn();
  return {stop,report,relaunch,run:createDataDeletion(root,stop,report,relaunch)};
}
it.each(['EACCES','EPERM','EBUSY'])('preserves all data on rename failure %s and relaunches', async code => {
  io.rename.mockRejectedValueOnce(Object.assign(new Error('locked'),{code}));
  const s=setup();
  await s.run();
  expect(s.stop).toHaveBeenCalledOnce();
  expect(io.rm).not.toHaveBeenCalled();
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({code}),true);
  expect(io.open).toHaveBeenCalledWith(root + '.delete-pending',expect.any(Number),0o600);
  expect(s.relaunch).toHaveBeenCalledOnce();
});
it('quiesces before one atomic rename and relaunches without deleting', async () => {
  const s=setup(); await s.run();
  expect(io.rename).toHaveBeenCalledWith(root,expect.stringMatching(new RegExp('^' + root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.deleting-')));
  expect(s.stop.mock.invocationCallOrder[0]).toBeLessThan(io.rename.mock.invocationCallOrder[0]!);
  expect(io.rename.mock.invocationCallOrder[0]).toBeLessThan(s.relaunch.mock.invocationCallOrder[0]!);
  expect(io.rm).toHaveBeenCalledWith(root + '.delete-pending',{force:true});
});
it('holds admission across concurrent calls and failures', async () => {
  const s=setup(); let release!:()=>void;
  s.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  const first=s.run(); await expect(s.run()).rejects.toThrow('already in progress');
  await vi.waitFor(()=>expect(s.stop).toHaveBeenCalledOnce());
  io.rename.mockRejectedValueOnce(new Error('INCOMPLETE'));
  release(); await first; await expect(s.run()).rejects.toThrow('already in progress');
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'INCOMPLETE'}),true);
  expect(s.stop).toHaveBeenCalledOnce(); expect(s.relaunch).toHaveBeenCalledOnce();
});
it('reports partial stop failure and always relaunches', async () => {
  const s=setup(); s.stop.mockRejectedValueOnce(new Error('stop failed'));
  await s.run(); expect(io.rename).not.toHaveBeenCalled();
  expect(workers.resume).not.toHaveBeenCalled();
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'stop failed'}),true);
  expect(s.relaunch).toHaveBeenCalledOnce();
});
it('retries quarantines next startup, including incomplete cleanup', async () => {
  io.readdir.mockResolvedValue(['owned.deleting-123-12345678-1234-1234-1234-123456789abc','other.deleting-123','owned']);
  io.rm.mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined);
  const log=vi.fn();
  await cleanupDeletedData(root,log); await cleanupDeletedData(root,log);
  expect(io.rm).toHaveBeenCalledTimes(2);
  expect(io.rm).toHaveBeenCalledWith(join(dirname(root),'owned.deleting-123-12345678-1234-1234-1234-123456789abc'),expect.objectContaining({recursive:true}));
  expect(log).toHaveBeenCalledWith(expect.objectContaining({phase:'delete-cleanup-failed'}));
});
it.each(['stop','workers'])('bounds a hanging %s and reports before restarting', async kind => {
  vi.useFakeTimers();
  try {
    const s = setup();
    if (kind === 'stop') s.stop.mockImplementation(() => new Promise(() => {}));
    else workers.waitForIdle.mockImplementation(() => new Promise(() => {}));
    const pending = s.run();
    await vi.advanceTimersByTimeAsync(15_001);
    await pending;
    expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'Deletion quiesce timed out'}),true);
    expect(s.relaunch).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
it('retries cleanup and returns a visible failure state', async () => {
  io.readdir.mockResolvedValue(['owned.deleting-123-12345678-1234-1234-1234-123456789abc']);
  io.rm.mockRejectedValue(Error('locked'));
  expect(await cleanupDeletedData(root,vi.fn())).toBe(false);
  expect(io.rm).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({maxRetries:5,retryDelay:200}));
});
it('ignores loose prefixes, files and symlinked quarantine candidates', async () => {
  const suffix = '.deleting-123-12345678-1234-1234-1234-123456789abc';
  io.readdir.mockResolvedValue(['owned.deleting-not-trash', 'owned'+suffix, 'owned'+suffix+'junk']);
  io.lstat.mockResolvedValue({isDirectory:()=>false,isSymbolicLink:()=>true});
  await cleanupDeletedData(root,vi.fn());
  expect(io.rm).not.toHaveBeenCalled();
});

it('does not promise deferred deletion when the marker cannot be persisted', async () => {
  io.open.mockRejectedValueOnce(Error('disk full'));
  const s = setup(); await s.run();
  expect(s.stop).not.toHaveBeenCalled();
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'disk full'}),false);
});

it('removes a partially written marker and keeps the app usable', async () => {
  io.open.mockResolvedValueOnce({writeFile:vi.fn().mockRejectedValue(Error('disk full')),close:vi.fn()});
  const s = setup(); await s.run();
  expect(io.rm).toHaveBeenCalledWith(root + '.delete-pending',{force:true});
  expect(s.relaunch).not.toHaveBeenCalled();
  expect(s.stop).not.toHaveBeenCalled();
});
it.each(['EINVAL','ENOTSUP'])('accepts unsupported directory fsync %s', async code => {
  io.open.mockResolvedValueOnce({writeFile:vi.fn(),sync:vi.fn(),close:vi.fn()})
    .mockResolvedValueOnce({sync:vi.fn().mockRejectedValue(Object.assign(Error(code),{code})),close:vi.fn()});
  const s=setup(); await s.run(); expect(s.stop).toHaveBeenCalledOnce();
});

it('aborts a storage-owning stream before waiting for its release', async () => {
  vi.resetModules();
  const maintenance = await import('../storage/maintenance');
  const deletion = await import('./delete-data');
  const release = maintenance.enterStorageRequest();
  const stop = vi.fn(async () => {release();});
  const pending = deletion.createDataDeletion(root,stop,vi.fn(),vi.fn())();
  try { await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce(),{timeout:100}); }
  finally { release(); await pending; }
});

it('aggregates multiple quarantine failures into one notice', async () => {
  io.readdir.mockResolvedValue([1,2].map(n => `owned.deleting-${n}-12345678-1234-1234-1234-123456789abc`));
  io.rm.mockRejectedValue(Error('locked'));
  const notice=vi.fn(); await cleanupDeletedData(root,notice);
  expect(notice).toHaveBeenCalledOnce();
});

it.each(['EACCES','EPERM','EBUSY'])('holds Windows admission and retains the marker after %s', async code => {
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  vi.useFakeTimers();
  try {
    io.readdir.mockResolvedValue(['secrets.json','library']);
    io.rm.mockImplementation(async (path: string) => {
      if (path === join(root,'library')) throw Object.assign(Error('locked'),{code});
    });
    const s = setup();
    const pending = s.run();
    await expect(s.run()).rejects.toThrow('already in progress');
    await vi.advanceTimersByTimeAsync(1101);
    await pending;
    expect(io.rename).not.toHaveBeenCalled();
    expect(io.realpath).toHaveBeenCalledWith(root);
    expect(s.stop.mock.invocationCallOrder[0]).toBeLessThan(io.rm.mock.invocationCallOrder[0]!);
    expect(io.rm).toHaveBeenCalledWith(join(root,'secrets.json'),expect.objectContaining({recursive:true}));
    expect(io.rm.mock.calls.filter(([path]) => path === join(root,'library'))).toHaveLength(4);
    expect(io.rm).not.toHaveBeenCalledWith(root+'.delete-pending',expect.anything());
    expect(s.report).toHaveBeenCalledWith(expect.objectContaining({code}),true);
    expect(s.relaunch).toHaveBeenCalledOnce();
    await expect(s.run()).rejects.toThrow('already in progress');
  } finally { vi.useRealTimers(); }
});
