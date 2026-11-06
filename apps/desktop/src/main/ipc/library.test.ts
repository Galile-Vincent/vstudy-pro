/**
 * Regression coverage for ipc library.
 * Owned by main/ipc.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { documentSchema } from '../../shared/domain';
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerLibraryIpc } from './library';
import { libraryContract } from '../../shared/library';
import type { IpcChannel } from '../../shared/ipc';
const mocked = vi.hoisted(() => ({ root: '', save: vi.fn(async ():Promise<{canceled:boolean;filePath?:string}> => ({ canceled: true })) }));
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

it('exports the active AI Markdown version captured before the save dialog',async()=>{
 mocked.root=mkdtempSync(join(tmpdir(),'library-ai-export-'));const directory=join(mocked.root,'library','a'.repeat(64));mkdirSync(directory,{recursive:true});
 const store=openStore(':memory:');const id=documentSchema.parse({id:'11111111-1111-4111-a111-111111111111',title:'Notes',sourceName:'notes.md',sourceHash:'a'.repeat(64),sourcePath:join(directory,'source.md'),markdownPath:join(directory,'content.md'),status:'ready',mime:'text/markdown',createdAt:new Date().toISOString()}).id;
 writeFileSync(join(directory,'source.md'),'source');writeFileSync(join(directory,'content.md'),'original');writeFileSync(join(directory,'content.ai.md'),'selected AI content');
 store.documents.insert(documentSchema.parse({id,title:'Notes',sourceName:'notes.md',sourceHash:'a'.repeat(64),sourcePath:join(directory,'source.md'),markdownPath:join(directory,'content.md'),status:'ready',mime:'text/markdown',createdAt:new Date().toISOString()}));store.db.prepare("UPDATE documents SET activeVersion='ai' WHERE id=?").run(id);
 const handlers=new Map<string,(event:IpcMainInvokeEvent,r:unknown)=>unknown>();const registrar=createIpcRegistrar({handle:(c,h)=>{handlers.set(c,h);},removeHandler:()=>{}},()=>true);
 const dispose=registerLibraryIpc(registrar,store,new Set());const destination=join(mocked.root,'export.md');
 mocked.save.mockImplementationOnce(async()=>{store.db.prepare("UPDATE documents SET activeVersion='original' WHERE id=?").run(id);return {canceled:false,filePath:destination};});
 try {
  await expect(handlers.get('library:exportMarkdown')!({sender:{id:2}} as IpcMainInvokeEvent,{documentId:id})).resolves.toEqual({saved:true});
  expect(readFileSync(destination,'utf8')).toBe('selected AI content');
 } finally {await dispose.waitForIdle();dispose();registrar.dispose();store.close();rmSync(mocked.root,{recursive:true,force:true});}
});
