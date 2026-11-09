import { beforeEach, expect, it, vi } from 'vitest';
import { createDataDeletion, cleanupDeletedData } from './delete-data';
const io = vi.hoisted(() => ({rename:vi.fn(),rm:vi.fn(),readdir:vi.fn(),open:vi.fn()}));
const workers = vi.hoisted(() => ({suspend:vi.fn(),waitForIdle:vi.fn(),resume:vi.fn()}));
vi.mock('node:fs/promises', () => io);
vi.mock('../review/workers', () => ({reviewWorkers:workers}));
beforeEach(() => {vi.resetAllMocks(); io.open.mockResolvedValue({writeFile:vi.fn(),sync:vi.fn(),close:vi.fn()});});
function setup() {
  const stop=vi.fn(), report=vi.fn(), relaunch=vi.fn();
  return {stop,report,relaunch,run:createDataDeletion('/owned',stop,report,relaunch)};
}
it.each(['EACCES','EPERM','EBUSY'])('preserves all data on rename failure %s and relaunches', async code => {
  io.rename.mockRejectedValueOnce(Object.assign(new Error('locked'),{code}));
  const s=setup();
  await s.run();
  expect(s.stop).toHaveBeenCalledOnce();
  expect(io.rm).not.toHaveBeenCalled();
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({code}));
  expect(io.open).toHaveBeenCalledWith('/owned.delete-pending','w',0o600);
  expect(s.relaunch).toHaveBeenCalledOnce();
});
it('quiesces before one atomic rename and relaunches without deleting', async () => {
  const s=setup(); await s.run();
  expect(io.rename).toHaveBeenCalledWith('/owned',expect.stringMatching(/^\/owned\.deleting-/));
  expect(s.stop.mock.invocationCallOrder[0]).toBeLessThan(io.rename.mock.invocationCallOrder[0]!);
  expect(io.rename.mock.invocationCallOrder[0]).toBeLessThan(s.relaunch.mock.invocationCallOrder[0]!);
  expect(io.rm).toHaveBeenCalledWith('/owned.delete-pending',{force:true});
});
it('holds admission across concurrent calls and failures', async () => {
  const s=setup(); let release!:()=>void;
  s.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  const first=s.run(); await expect(s.run()).rejects.toThrow('already in progress');
  await vi.waitFor(()=>expect(s.stop).toHaveBeenCalledOnce());
  io.rename.mockRejectedValueOnce(new Error('INCOMPLETE'));
  release(); await first; await expect(s.run()).rejects.toThrow('already in progress');
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'INCOMPLETE'}));
  expect(s.stop).toHaveBeenCalledOnce(); expect(s.relaunch).toHaveBeenCalledOnce();
});
it('reports partial stop failure and always relaunches', async () => {
  const s=setup(); s.stop.mockRejectedValueOnce(new Error('stop failed'));
  await s.run(); expect(io.rename).not.toHaveBeenCalled();
  expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'stop failed'}));
  expect(s.relaunch).toHaveBeenCalledOnce();
});
it('retries quarantines next startup, including incomplete cleanup', async () => {
  io.readdir.mockResolvedValue(['owned.deleting-123','other.deleting-123','owned']);
  io.rm.mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined);
  const log=vi.fn();
  await cleanupDeletedData('/owned',log); await cleanupDeletedData('/owned',log);
  expect(io.rm).toHaveBeenCalledTimes(2);
  expect(io.rm).toHaveBeenCalledWith('/owned.deleting-123',expect.objectContaining({recursive:true}));
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
    expect(s.report).toHaveBeenCalledWith(expect.objectContaining({message:'Deletion quiesce timed out'}));
    expect(s.relaunch).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
