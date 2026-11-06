/** Disk-space admission is best effort on filesystems without capacity reporting. */
import { expect, it, vi } from 'vitest';
import { stat, statfs } from 'node:fs/promises';
import { requireFreeSpace } from './space';
vi.mock('node:fs/promises',()=>({stat:vi.fn(),statfs:vi.fn()}));
it.each([
 {bsize:4096,bavail:0,blocks:0},
 {bsize:0,bavail:0,blocks:100},
])('skips unknown filesystem capacity %j',async info=>{
 vi.mocked(stat).mockResolvedValue({dev:1} as Awaited<ReturnType<typeof stat>>);
 vi.mocked(statfs).mockResolvedValue(info as Awaited<ReturnType<typeof statfs>>);
 await expect(requireFreeSpace([{path:'volume',bytes:1024}])).resolves.toBeUndefined();
});
it('rejects zero free space on a filesystem with known capacity',async()=>{
 vi.mocked(stat).mockResolvedValue({dev:1} as Awaited<ReturnType<typeof stat>>);
 vi.mocked(statfs).mockResolvedValue({bsize:4096,bavail:0,blocks:100} as Awaited<ReturnType<typeof statfs>>);
 await expect(requireFreeSpace([{path:'volume',bytes:1024}])).rejects.toMatchObject({code:'ENOSPC',availableBytes:0});
});
