/**
 * Regression coverage for ipc library.
 * Owned by main/ipc.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerLibraryIpc } from './library';
import { documentSchema } from '../../shared/domain';
import { libraryContract } from '../../shared/library';
import type { IpcChannel } from '../../shared/ipc';
const mocked = vi.hoisted(() => ({ root: '', save: vi.fn(async () => ({ canceled: true })) }));
vi.mock('electron', () => ({ BrowserWindow:{fromWebContents:()=>({id:1,isDestroyed:()=>false})}, app: { getPath: () => mocked.root }, dialog: { showSaveDialog: mocked.save }, shell: { showItemInFolder: vi.fn(), openPath: vi.fn(async () => '') } }));
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

it.each(['library:exportOriginal','library:exportMarkdown'])('parents %s and settles native cancellation', async channel => {
  mocked.root=mkdtempSync(join(tmpdir(),'library-owner-'));
  const root=join(mocked.root,'library');mkdirSync(root);
  const store=openStore(':memory:');
  const document=store.documents.insert(documentSchema.parse({id:'00000000-0000-4000-8000-000000000001',title:'Notes',sourceName:'notes.md',sourceHash:'a'.repeat(64),sourcePath:join(root,'source.md'),markdownPath:join(root,'content.md'),mime:'text/markdown',status:'ready',createdAt:new Date().toISOString()}));
  writeFileSync(document.sourcePath,'notes');writeFileSync(document.markdownPath,'notes');
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const registrar=createIpcRegistrar({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:()=>{}},()=>true);
  const dispose=registerLibraryIpc(registrar,store,new Set());
  try {
    expect(await handlers.get(channel)!({sender:{id:7}} as IpcMainInvokeEvent,{documentId:document.id})).toEqual({saved:false});
    expect(mocked.save).toHaveBeenCalledWith(expect.objectContaining({id:1}),expect.objectContaining({defaultPath:'notes.md'}));
  } finally {dispose();registrar.dispose();store.close();rmSync(mocked.root,{recursive:true,force:true});}
});
