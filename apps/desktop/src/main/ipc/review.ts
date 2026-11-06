import { documentIdSchema } from "../../shared/domain";
import { app } from "electron";
import { dirname, join } from "node:path";
import { open } from "node:fs/promises";
import { containedPath } from "../services/file-paths";
import type { Store } from '../db';
import type { IpcChannel } from '../../shared/ipc';
import { reviewIpc } from '../../shared/review';
import type { createIpcRegistrar } from './register';
import { ReviewRepository } from '../review/repository';
import { reviewWorkers } from '../review/workers';
export function registerReviewIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, implemented: Set<IpcChannel>) {
    const repo = new ReviewRepository(store.db);
    for (const channel of Object.keys(reviewIpc) as (keyof typeof reviewIpc)[])
        implemented.add(channel);
    if (!repo.getPrefs().memoryEnabled)
        reviewWorkers.suspend('privacy');
    registrar.handle('review:courses:create', input => repo.createCourse(input));
    registrar.handle('review:courses:update', ({ courseId, changes }) => repo.updateCourse(courseId, changes));
    registrar.handle('review:courses:list', input => repo.listCourses(input));
    registrar.handle('review:courses:get', ({ courseId }) => repo.getCourse(courseId));
    registrar.handle('review:courses:archive', ({ courseId, archived }) => { repo.archiveCourse(courseId, archived); return { ok: true }; });
    registrar.handle('review:courses:link-moodle', ({ courseId, moodleCourseId }) => repo.linkMoodle(courseId, moodleCourseId));
    registrar.handle('review:courses:materialize', ({ moodleCourseId }) => repo.materializeMoodleCourse(moodleCourseId));
    registrar.handle('review:courses:mastery', input => repo.masteryPage(input, Date.now()));
    registrar.handle('review:courses:units', input => repo.listUnits(input));
    registrar.handle('review:docs:link', async ({ courseId, documentId }) => {
        const document = store.documents.get(documentIdSchema.parse(documentId));
        if (!document)
            throw new Error('Document unavailable');
        const headings: string[] = [];
        if (document.status === 'ready') {
            const path = document.activeVersion === 'ai' ? join(dirname(document.markdownPath), 'content.ai.md') : document.markdownPath;
            const file = await open(containedPath(join(app.getPath('userData'), 'library'), path), 'r');
            try {
                const buffer = Buffer.alloc(65536);
                const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
                for (const match of buffer.subarray(0, bytesRead).toString('utf8').matchAll(/^#{1,6}\s+(.+)$/gm)) {
                    headings.push(match[1]!.slice(0, 240));
                    if (headings.length === 80)
                        break;
                }
            }
            finally {
                await file.close();
            }
        }
        repo.linkDocument(courseId, documentId, headings);
        return { ok: true };
    });
    registrar.handle('review:docs:unlink', ({ courseId, documentId }) => { repo.unlinkDocument(courseId, documentId); return { ok: true }; });
    registrar.handle('review:chat:assign', ({ conversationId, courseId }) => repo.assignChat(conversationId, courseId));
    registrar.handle('review:chat:exclude', ({ conversationId, excluded }) => repo.excludeChat(conversationId, excluded));
    registrar.handle('review:chat:inbox', input => repo.inbox(input));
    registrar.handle('review:concepts:list', input => repo.listConcepts(input));
    registrar.handle('review:concepts:add', input => repo.addConcept(input));
    registrar.handle('review:concepts:edit', ({ conceptId, changes }) => repo.editConcept(conceptId, changes));
    registrar.handle('review:concepts:dismiss', ({ conceptId }) => { repo.dismissConcept(conceptId); return { ok: true }; });
    registrar.handle('review:concepts:restore', ({ conceptId }) => { repo.restoreConcept(conceptId); return { ok: true }; });
    registrar.handle('review:concepts:understood', ({ conceptId }) => { repo.understoodConcept(conceptId); return { ok: true }; });
    registrar.handle('review:observations:page', input => repo.observationsPage(input));
    registrar.handle('review:observations:edit', ({ observationId, changes }) => { repo.editObservation(observationId, changes); return { ok: true }; });
    registrar.handle('review:observations:delete', ({ observationId }) => { repo.deleteObservation(observationId); return { ok: true }; });
    registrar.handle('review:prefs:get', () => repo.getPrefs());
    registrar.handle('review:prefs:set', async (input) => { if (input.memoryEnabled === false) {
        reviewWorkers.suspend('privacy');
        await reviewWorkers.waitForIdle();
    } const prefs = repo.setPrefs(input); if (prefs.memoryEnabled)
        reviewWorkers.resume('privacy'); return prefs; });
    registrar.handle('review:prefs:erase', async () => { reviewWorkers.suspend('privacy'); await reviewWorkers.waitForIdle(); repo.erase(); return { ok: true }; });
    return repo;
}
