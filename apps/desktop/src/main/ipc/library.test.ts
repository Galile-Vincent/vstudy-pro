import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerLibraryIpc } from './library';
import { libraryContract } from '../../shared/library';
import type { IpcChannel } from '../../shared/ipc';
const mocked = vi.hoisted(() => ({ root: '', save: vi.fn(async () => ({ canceled: true })) }));
vi.mock('electron', () => ({ app: { getPath: () => mocked.root }, dialog: { showSaveDialog: mocked.save }, shell: { showItemInFolder: vi.fn(), openPath: vi.fn(async () => '') } }));
it('registers every library contract through strict validation and sender checks', async () => { mocked.root = mkdtempSync(join(tmpdir(), 'library-ipc-')); mkdirSync(join(mocked.root, 'library')); const store = openStore(':memory:'); const handlers = new Map<string, (event: IpcMainInvokeEvent, r: unknown) => unknown>(); let trusted = true; const registrar = createIpcRegistrar({ handle: (c, h) => { handlers.set(c, h); }, removeHandler: () => { } }, () => trusted); const implemented = new Set<IpcChannel>(); const dispose = registerLibraryIpc(registrar, store, implemented); const invoke = (c: string, r: unknown) => handlers.get(c)!({ sender: { id: 1 } } as IpcMainInvokeEvent, r); try {
    expect(implemented.size).toBe(Object.keys(libraryContract).length);
    await expect(invoke('library:tree', {})).resolves.toEqual([]);
    await expect(invoke('library:folders:create', { name: 'Study', path: '/tmp' })).rejects.toThrow();
    await expect(invoke('activity:heartbeat', { documentId: 'invalid', seconds: 999 })).rejects.toThrow();
    await expect(invoke('library:exportOriginal', { documentId: 'invalid', path: '/etc/passwd' })).rejects.toThrow();
    await expect(invoke('dashboard:get', {})).resolves.toMatchObject({ month: { calls: 0 }, streak: { current: 0 }, series: expect.any(Array) });
    trusted = false;
    await expect(invoke('library:documents:list', {})).rejects.toThrow('Untrusted');
}
finally {
    dispose();
    registrar.dispose();
    store.close();
    rmSync(mocked.root, { recursive: true, force: true });
} });
