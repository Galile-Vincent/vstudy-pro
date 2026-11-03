import { searchInWorker } from '../services/search-runner';
import { documentIdSchema } from '../../shared/domain';
import { app, dialog, shell } from 'electron';
import { safeFilename } from "../security";
import { exportFile } from '../services/export-file';
import { basename, extname, join } from 'node:path';
import type { Store } from '../db';
import type { IpcChannel } from '../../shared/ipc';
import type { createIpcRegistrar } from './register';
import { LibraryService, containedPath } from '../services/library';
import { ActivityService } from '../services/activity';
import { getDashboard } from '../services/dashboard';
export function registerLibraryIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, implemented: Set<IpcChannel>, deleteDocument: (id: import("../../shared/domain").Document["id"], remove: () => Promise<void>) => Promise<void> = (_id, remove) => remove()) {
    const library = new LibraryService(store, join(app.getPath('userData'), 'library')), activity = new ActivityService(store);
    library.search.rebuild();
    const handle: typeof registrar.handle = (channel, handler) => { implemented.add(channel); registrar.handle(channel, handler); };
    handle('messages:page',r=>store.messages.page(r.conversationId,r.limit,r.cursor));
    handle('usage:page',r=>store.usage.page(r.limit,r.cursor));
    handle('library:folders:list', () => library.folders());
    handle('library:counts', () => { const r=store.db.prepare("SELECT count(*) AS 'all',sum(lastOpenedAt IS NOT NULL) AS recent,sum(pinned=1) AS pinned,sum(folderId IS NULL) AS unfiled,sum(status IN('converting','failed')) AS 'converting-failed' FROM documents WHERE deletedAt IS NULL").get(); return Object.fromEntries(Object.entries(r??{}).map(([k,v])=>[k,Number(v??0)])); });
    handle('library:tree' , () => library.folders());
    handle('library:folders:create', r => library.createFolder(r.name, r.parentId));
    handle('library:folders:update', r => library.updateFolder(r.folderId, r));
    handle('library:folders:move', r => { library.moveFolder(r.folderId, r.parentId, r.beforeId); return { ok: true }; });
    handle('library:folders:delete', r => { library.deleteFolder(r.folderId, r.destination); return { ok: true }; });
    handle('library:documents:list', r => r.text ? searchInWorker('library:documents:list', r, String(store.db.prepare('PRAGMA database_list').get()!.file), library.root) : library.list(r));
    handle('library:documents:move', r => { library.move(r.documentIds, r.folderId, r.beforeId); return { ok: true }; });
    handle('library:documents:pin', r => { library.pin(r.documentId, r.pinned); return { ok: true }; });
    handle('library:pins:reorder', r => { library.reorderPins(r.kind, r.ids); return { ok: true }; });
    handle('library:documents:rename', r => { library.rename(r.documentId, r.title); return { ok: true }; });
    handle('library:documents:softDelete', async (r) => { await deleteDocument(documentIdSchema.parse(r.documentId), async () => { library.softDelete(r.documentId); }); return { ok: true }; });
    handle('library:documents:restore', r => { library.restore(r.documentId); return { ok: true }; });
    handle('library:documents:purge', () => { library.purge(); return { ok: true }; });
    handle('library:tags:list', () => library.tags());
    handle('library:tags:save', r => library.saveTag(r));
    handle('library:tags:delete', r => { library.deleteTag(r.tagId); return { ok: true }; });
    handle('library:documents:tag', r => { library.tag(r.documentId, r.tagId, r.assigned); return { ok: true }; });
    handle('library:savedFilters:list', () => library.filters());
    handle('library:savedFilters:save', r => library.saveFilter(r));
    handle('library:savedFilters:delete', r => { library.deleteFilter(r.id); return { ok: true }; });
    handle('library:search', r => searchInWorker('library:search', r, String(store.db.prepare('PRAGMA database_list').get()!.file), library.root));
    const beats = new Map<string, number>();
    handle('activity:heartbeat', (r, event) => { library.require(r.documentId); const key = `${event.sender.id}:${r.documentId}`, now = Date.now(), last = beats.get(key) ?? now - 60000; const seconds = Math.min(r.seconds, Math.floor((now - last) / 1000)); if (seconds > 0) {
        activity.record('read', r.documentId, seconds);
        beats.set(key, now);
    } return { ok: true }; });
    handle('dashboard:get', () => getDashboard(library, activity));
    const exports = new Map<number, number>();
    for (const channel of ['library:exportMarkdown', 'library:exportOriginal'] as const)
        handle(channel, async (r, event) => {
            const now = Date.now();
            if (now - (exports.get(event.sender.id) ?? 0) < 1000)
                throw new Error('Export rate limited');
            exports.set(event.sender.id, now);
            const d = library.require(r.documentId), path = containedPath(library.root, channel === 'library:exportMarkdown' ? d.markdownPath : d.sourcePath);
            const result = await dialog.showSaveDialog({ defaultPath: channel === 'library:exportMarkdown' ? safeFilename(`${basename(d.sourceName, extname(d.sourceName))}.md`) : safeFilename(basename(d.sourceName)) });
            if (result.canceled || !result.filePath)
                return { saved: false };
            await exportFile(path, result.filePath);
            return { saved: true };
        });
    handle('library:reveal', r => { shell.showItemInFolder(containedPath(library.root, library.require(r.documentId).sourcePath)); return { ok: true }; });
    handle('library:openOriginal', async (r) => { const d = library.require(r.documentId), path = containedPath(library.root, d.sourcePath); if (!['.pdf', '.docx', '.xlsx', '.pptx', '.md', '.txt', '.csv'].includes(extname(path).toLowerCase()))
        throw new Error('File type cannot be opened'); const error = await shell.openPath(path); if (error)
        throw new Error('Open failed'); return { ok: true }; });
    const purge = setInterval(() => { try {
        library.purge();
    }
    catch { /* Failed filesystem purges remain queued for the next idle pass. */ } }, 30000);
    purge.unref();
    return () => clearInterval(purge);
}
