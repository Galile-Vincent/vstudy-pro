/** Best-effort admission checks; later ENOSPC errors still propagate normally. */
import { stat, statfs } from 'node:fs/promises';

export class StorageSpaceError extends Error {
  readonly code = 'ENOSPC';
  constructor(readonly requiredBytes: number, readonly availableBytes: number) {
    super('storage.disk_full');
    this.name = 'StorageSpaceError';
  }
}

/** Add staging and output requirements when they share a filesystem. */
export async function requireFreeSpace(requirements: {path: string; bytes: number}[]): Promise<void> {
  const disks = new Map<number, {path: string; bytes: number}>();
  for (const requirement of requirements) {
    const {dev} = await stat(requirement.path);
    const disk = disks.get(dev);
    if (disk) disk.bytes += requirement.bytes;
    else disks.set(dev, {...requirement});
  }
  for (const disk of disks.values()) {
    const info = await statfs(disk.path);
    if (info.bsize <= 0 || info.bavail === 0 && info.blocks === 0) continue;
    const available = info.bavail * info.bsize;
    if (available < disk.bytes) throw new StorageSpaceError(disk.bytes, available);
  }
}
