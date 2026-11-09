import { assertCatalogModel } from '../services/catalog-model';
import { app, dialog, type IpcMainInvokeEvent } from 'electron';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Store } from '../db';
import type { ProviderRegistry } from '../providers';
import type { createIpcRegistrar } from './register';
import { type IpcChannel } from '../../shared/ipc';
import { requestIdSchema, conversationIdSchema, documentIdSchema, type Usage } from '../../shared/domain';
import { rendererArtifact, reviewGenerateIpc, reviewProgressChannel, reviewProgressSchema, type GenerationRequest, type ReviewProgress } from '../../shared/review-generate';
import { ArtifactRepository } from '../review/artifact-repository';
import { GenerationService } from '../review/generate';
import { excerptKind } from '../review/source-kind';
import { EXAM_COURSE_ID } from '../../shared/review-artifacts';
import { Attempts } from '../review/attempts';
import { reviewAdmission, type Admission } from '../review/admission-port';
import { containedPath } from '../services/file-paths';
import { exportText } from '../services/export-file';
import { ownerWindow } from '../dialogs';
import { priceUsage } from '../pricing';
export function progressFor(event: IpcMainInvokeEvent) {
    const origin = event.senderFrame?.url;
    let last = 0;
    let pending: ReviewProgress | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = (value: ReviewProgress) => { if (!event.sender.isDestroyed() && event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === origin)
        event.sender.send(reviewProgressChannel, reviewProgressSchema.parse(value)); };
    return (value: ReviewProgress) => {
        const terminal = ['ready', 'failed', 'interrupted'].includes(value.stage);
        pending = value;
        if (terminal || Date.now() - last >= 100) {
            if (timer)
                clearTimeout(timer);
            timer = undefined;
            pending = undefined;
            last = Date.now();
            send(value);
        }
        else if (!timer)
            timer = setTimeout(() => { timer = undefined; if (pending) {
                send(pending);
                pending = undefined;
                last = Date.now();
            } }, 100);
    };
}
export function registerReviewGenerateIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, implemented: Set<IpcChannel>, providers: ProviderRegistry, admission: Admission = reviewAdmission) {
    const reservation = (prompt: string, r: GenerationRequest) => { const usage = priceUsage(r.modelId, { inputTokens: Buffer.byteLength(prompt), outputTokens: r.providerId.endsWith('-cli') ? 240000 : 8192, costSource: 'estimated' }, store.settings.get().priceOverrides); return { ...usage, costUsd: usage.costUsd }; };
    const repo = new ArtifactRepository(store.db), attempts = new Attempts(repo);
    repo.recover();
    const service = new GenerationService(repo, {
        admission,
        async readExcerpt(id, maxBytes, signal) { signal.throwIfAborted(); const doc = store.documents.get(documentIdSchema.parse(id)); if (!doc || doc.status !== 'ready')
            throw new Error('review.source_unavailable'); const path = doc.activeVersion === 'ai' ? join(dirname(doc.markdownPath), 'content.ai.md') : doc.markdownPath; const file = await open(containedPath(join(app.getPath('userData'), 'library'), path), constants.O_RDONLY | constants.O_NOFOLLOW); try {
            const stat = await file.stat();
            if (!stat.isFile())
                throw new Error('review.source_unavailable');
            const buffer = Buffer.alloc(maxBytes);
            const { bytesRead } = await file.read(buffer, 0, maxBytes, 0);
            const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer.subarray(0, bytesRead), { stream: true });
            signal.throwIfAborted();
            return { documentId: id, version: doc.activeVersion, excerptHash: createHash('sha256').update(text).digest('hex'), text, kind: excerptKind(store.db, id) ?? 'unknown', truncated: stat.size > maxBytes };
        }
        finally {
            await file.close();
        } },
        estimate: reservation,
        async call(prompt, r, signal, onUsage) { await assertCatalogModel(providers, r.providerId, r.modelId, 'review.model_unavailable'); let output = '', done = false, usage: Usage | undefined; try {
            for await (const event of providers.get(r.providerId).stream({ scope: 'general', requestId: requestIdSchema.parse(randomUUID()), conversationId: conversationIdSchema.parse(randomUUID()), providerId: r.providerId, modelId: r.modelId, userMessage: 'Generate a study aid from the supplied data.', prompt, allowPresentation: false, maxOutputTokens: 8192, onUsageSnapshot: snapshot => { usage = snapshot; } }, signal)) {
                signal.throwIfAborted();
                if (event.type === 'tool-call' || event.type === 'proposals' || event.type === 'error')
                    throw new Error('review.provider_failed');
                if (event.type === 'text-delta') {
                    output += event.text;
                    if (Buffer.byteLength(output) > 240000)
                        throw new Error('review.output_limit');
                }
                if (event.type === 'usage')
                    usage = event.usage;
                if (event.type === 'done')
                    done = true;
            }
            if (!done)
                throw new Error('review.provider_failed');
            return output;
        }
        finally {
            // A call that never completed has unseen remote output: keep the reservation unless the provider reported its cost.
            const overrides = store.settings.get().priceOverrides;
            const measured = done || usage?.costSource === 'reported' ? priceUsage(r.modelId, { ...usage ?? { inputTokens: Buffer.byteLength(prompt), costSource: 'estimated' as const }, outputTokens: usage?.outputTokens || Buffer.byteLength(output) }, overrides) : reservation(prompt, r);
            onUsage({ ...measured, costUsd: measured.costUsd });
            store.usage.record({ ...measured, id: randomUUID(), createdAt: new Date().toISOString(), providerId: r.providerId, modelId: r.modelId, kind: 'chat', aborted: signal.aborted });
        } },
    });
    for (const channel of Object.keys(reviewGenerateIpc) as (keyof typeof reviewGenerateIpc)[])
        implemented.add(channel);
    registrar.handle('review:artifact:generate', async (r, event) => { await assertCatalogModel(providers, r.providerId, r.modelId, 'review.model_unavailable'); return rendererArtifact(service.generate(r, progressFor(event))); });
    registrar.handle('review:artifact:retry', (r, event) => rendererArtifact(service.retry(r.artifactId, r.requestId, r.locale, progressFor(event))));
    registrar.handle('review:artifact:cancel', ({ artifactId }) => { service.cancel(artifactId); return { ok: true }; });
    registrar.handle('review:artifact:get', ({ artifactId }) => {const artifact=repo.find(artifactId); return artifact ? rendererArtifact(artifact) : null;});
    registrar.handle('review:artifact:list', r => repo.list(r));
    registrar.handle('review:artifact:delete', ({ artifactId }) => { service.cancel(artifactId); repo.delete(artifactId); return { ok: true }; });
    registrar.handle('review:artifact:export', async ({ artifactId }, event) => { const artifact = repo.find(artifactId); if (artifact?.status !== 'ready')
        throw new Error('review.artifact_unavailable'); const markdown = artifact.bodyMarkdown ?? '# Practice test\n\n' + artifact.test!.items.map((i, n) => `${n + 1}. ${i.stem}\n${i.type === 'mcq' ? i.options.map((s, j) => `   ${j + 1}. ${s}`).join('\n') : ''}\n\nAnswer: ${String(i.answer)}\n\n${i.explanation}\n\nSource: ${i.source.documentId}\n> ${i.source.quote}`).join('\n\n'); const options = { defaultPath: 'review.md', filters: [{ name: 'Markdown', extensions: ['md'] }] }; const owner = ownerWindow(event.sender); const selected = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options); if (selected.canceled || !selected.filePath)
        return { saved: false }; await exportText(markdown + '\n\nchecked for structure and sources, not guaranteed correct', selected.filePath); return { saved: true }; });
    registrar.handle('review:exam:history', request => {
        const page = repo.list({...request, courseId: EXAM_COURSE_ID});
        return {...page, items: page.items.map(artifact => {
            const row = repo.db.prepare('SELECT id FROM study_attempts WHERE artifactId=? ORDER BY startedAt DESC,id DESC LIMIT 1').get(artifact.id);
            const value = row ? attempts.get(String(row.id)) : null;
            const test = value ? repo.find(artifact.id)?.test : null;
            return {artifact, attempt: value ? {
                id: value.id, phase: value.phase, startedAt: value.startedAt, committedAt: value.committedAt,
                results: value.results.map(result => ({
                    itemId: result.itemId, correct: result.correct,
                    type: test!.items.find(item => item.id === result.itemId)!.type,
                })),
            } : null};
        })};
    });
    registrar.handle('review:attempt:explain', r => service.explain(r.attemptId,r.itemId,r.locale));
    registrar.handle('review:attempt:get', ({attemptId}) => attempts.get(attemptId));
    registrar.handle('review:attempt:start', ({ artifactId }) => attempts.start(artifactId));
    registrar.handle('review:attempt:answer', ({ attemptId, itemId, answer }) => attempts.answer(attemptId, itemId, answer));
    registrar.handle('review:attempt:draft', ({ attemptId, itemId, answer }) => attempts.saveDraft(attemptId, itemId, answer));
    registrar.handle('review:attempt:commit', ({ attemptId, itemId }) => attempts.commit(attemptId, itemId));
    registrar.handle('review:attempt:confirm', ({ attemptId }) => attempts.confirm(attemptId));
    registrar.handle('review:attempt:report-bad', ({ attemptId, itemId }) => attempts.reportBad(attemptId, itemId));
    return service;
}
