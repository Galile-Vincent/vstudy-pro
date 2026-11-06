import { app, dialog, type IpcMainInvokeEvent } from 'electron';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Store } from '../db';
import type { ProviderRegistry } from '../providers';
import type { createIpcRegistrar } from './register';
import { type IpcChannel } from '../../shared/ipc';
import { requestIdSchema, conversationIdSchema, documentIdSchema } from '../../shared/domain';
import { rendererArtifact, reviewGenerateIpc, reviewProgressChannel, reviewProgressSchema, type ReviewProgress } from '../../shared/review-generate';
import { ArtifactRepository } from '../review/artifact-repository';
import { GenerationService } from '../review/generate';
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
            return { documentId: id, version: doc.activeVersion, excerptHash: createHash('sha256').update(text).digest('hex'), text, truncated: stat.size > maxBytes };
        }
        finally {
            await file.close();
        } },
        estimate(prompt, r) { const usage = priceUsage(r.modelId, { inputTokens: Buffer.byteLength(prompt), outputTokens: r.providerId.endsWith('-cli') ? 240000 : 8192, costSource: 'estimated' }, store.settings.get().priceOverrides); return { ...usage, costUsd: usage.costUsd }; },
        async call(prompt, r, signal, onUsage) { let output = '', done = false; let measured = priceUsage(r.modelId, { inputTokens: Buffer.byteLength(prompt), outputTokens: 0, costSource: 'estimated' }, store.settings.get().priceOverrides); try {
            for await (const event of providers.get(r.providerId).stream({ scope: 'general', requestId: requestIdSchema.parse(randomUUID()), conversationId: conversationIdSchema.parse(randomUUID()), providerId: r.providerId, modelId: r.modelId, userMessage: 'Generate a study aid from the supplied data.', prompt, allowPresentation: false, maxOutputTokens: 8192, onUsageSnapshot: usage => { measured = priceUsage(r.modelId, usage, store.settings.get().priceOverrides); onUsage({ ...measured, costUsd: measured.costUsd }); } }, signal)) {
                signal.throwIfAborted();
                if (event.type === 'tool-call' || event.type === 'proposals' || event.type === 'error')
                    throw new Error('review.provider_failed');
                if (event.type === 'text-delta') {
                    output += event.text;
                    if (Buffer.byteLength(output) > 240000)
                        throw new Error('review.output_limit');
                }
                if (event.type === 'usage')
                    measured = priceUsage(r.modelId, event.usage, store.settings.get().priceOverrides);
                if (event.type === 'done')
                    done = true;
            }
            if (!done)
                throw new Error('review.provider_failed');
            return output;
        }
        finally {
            if (measured.outputTokens === 0)
                measured = priceUsage(r.modelId, { ...measured, outputTokens: Buffer.byteLength(output), costSource: 'estimated' }, store.settings.get().priceOverrides);
            onUsage({ ...measured, costUsd: measured.costUsd });
            store.usage.record({ ...measured, id: randomUUID(), createdAt: new Date().toISOString(), providerId: r.providerId, modelId: r.modelId, kind: 'chat', aborted: signal.aborted });
        } },
    });
    for (const channel of Object.keys(reviewGenerateIpc) as (keyof typeof reviewGenerateIpc)[])
        implemented.add(channel);
    registrar.handle('review:artifact:generate', (r, event) => rendererArtifact(service.generate(r, progressFor(event))));
    registrar.handle('review:artifact:retry', (r, event) => rendererArtifact(service.retry(r.artifactId, r.requestId, r.locale, progressFor(event))));
    registrar.handle('review:artifact:cancel', ({ artifactId }) => { service.cancel(artifactId); return { ok: true }; });
    registrar.handle('review:artifact:get', ({ artifactId }) => {const artifact=repo.find(artifactId); return artifact ? rendererArtifact(artifact) : null;});
    registrar.handle('review:artifact:list', r => repo.list(r));
    registrar.handle('review:artifact:delete', ({ artifactId }) => { service.cancel(artifactId); repo.delete(artifactId); return { ok: true }; });
    registrar.handle('review:artifact:export', async ({ artifactId }, event) => { const artifact = repo.find(artifactId); if (artifact?.status !== 'ready')
        throw new Error('review.artifact_unavailable'); const markdown = artifact.bodyMarkdown ?? '# Practice test\n\n' + artifact.test!.items.map((i, n) => `${n + 1}. ${i.stem}\n${i.type === 'mcq' ? i.options.map((s, j) => `   ${j + 1}. ${s}`).join('\n') : ''}\n\nAnswer: ${String(i.answer)}\n\n${i.explanation}\n\nSource: ${i.source.documentId}\n> ${i.source.quote}`).join('\n\n'); const options = { defaultPath: 'review.md', filters: [{ name: 'Markdown', extensions: ['md'] }] }; const owner = ownerWindow(event.sender); const selected = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options); if (selected.canceled || !selected.filePath)
        return { saved: false }; await exportText(markdown + '\n\nchecked for structure and sources, not guaranteed correct', selected.filePath); return { saved: true }; });
    registrar.handle('review:attempt:get', ({attemptId}) => attempts.get(attemptId));
    registrar.handle('review:attempt:start', ({ artifactId }) => attempts.start(artifactId));
    registrar.handle('review:attempt:answer', ({ attemptId, itemId, answer }) => attempts.answer(attemptId, itemId, answer));
    registrar.handle('review:attempt:commit', ({ attemptId, itemId }) => attempts.commit(attemptId, itemId));
    registrar.handle('review:attempt:confirm', ({ attemptId }) => attempts.confirm(attemptId));
    registrar.handle('review:attempt:report-bad', ({ attemptId, itemId }) => attempts.reportBad(attemptId, itemId));
    return service;
}
