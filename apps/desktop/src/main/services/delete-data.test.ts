import { beforeEach, expect, it, vi } from 'vitest';
import { createDataDeletion, cleanupDeletedData } from './delete-data';
const io = vi.hoisted(() => ({rename:vi.fn(),rm:vi.fn(),readdir:vi.fn()}));
const workers = vi.hoisted(() => ({suspend:vi.fn(),waitForIdle:vi.fn(),resume:vi.fn()}));
vi.mock('node:fs/promises', () => io);
vi.mock('../review/workers', () => ({reviewWorkers:workers}));
beforeEach(() => {vi.resetAllMocks();});
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
  expect(workers.resume).toHaveBeenCalledWith('delete-all');
  expect(s.relaunch).toHaveBeenCalledOnce();
});
it('quiesces before one atomic rename and relaunches without deleting', async () => {
  const s=setup(); await s.run();
  expect(io.rename).toHaveBeenCalledWith('/owned',expect.stringMatching(/^\/owned\.deleting-/));
  expect(s.stop.mock.invocationCallOrder[0]).toBeLessThan(io.rename.mock.invocationCallOrder[0]!);
  expect(io.rename.mock.invocationCallOrder[0]).toBeLessThan(s.relaunch.mock.invocationCallOrder[0]!);
  expect(io.rm).not.toHaveBeenCalled();
});
it('holds admission across concurrent calls and failures', async () => {
  const s=setup(); let release!:()=>void;
  s.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  const first=s.run(); await s.run();
  await vi.waitFor(()=>expect(s.stop).toHaveBeenCalledOnce());
  io.rename.mockRejectedValueOnce(new Error('INCOMPLETE'));
  release(); await first; await s.run();
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
