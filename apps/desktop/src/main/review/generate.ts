import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { GenerationRequest, ReviewProgress } from '../../shared/review-generate';
import { studyResolvedScopeSchema, studyTestSchema } from '../../shared/review-artifacts';
import { ArtifactRepository } from './artifact-repository';
import { ReviewRepository } from './repository';
import { resolveScope } from './scope';
import { buildBlueprint } from './blueprint';
import { notePlan } from './note-plan';
import { validateTest, REVIEW_VALIDATION_NOTICE, type Excerpt } from './test-validate';
import { notePrompt, testPrompt } from './prompts';
import type { Admission, ReviewEstimate } from './admission-port';
import { reviewWorkers, type ReviewWorker } from './workers';
import { Attempts } from './attempts';
export interface GenerationDependencies {
    admission: Admission;
    readExcerpt(documentId: string, maxBytes: number, signal: AbortSignal): Promise<Excerpt>;
    estimate(prompt: string, request: GenerationRequest): ReviewEstimate;
    call(prompt: string, request: GenerationRequest, signal: AbortSignal, onUsage: (usage: ReviewEstimate) => void): Promise<string>;
}
const noteOutput = z.object({ bodyMarkdown: z.string().min(1).max(200000), citations: z.array(z.object({ documentId: z.string(), version: z.enum(['original', 'ai']), excerptHash: z.string(), quote: z.string().min(1).max(240) }).strict()).min(1).max(100), omitted: z.array(z.string().max(240)).max(100) }).strict();
export class GenerationService implements ReviewWorker {
    private active = new Map<string, {
        controller: AbortController;
        promise: Promise<void>;
    }>();
    private stopped = false;
    private disposed = false;
    private unregister: () => void;
    constructor(readonly repo: ArtifactRepository, private readonly deps: GenerationDependencies) { this.unregister = reviewWorkers.register(this); }
    generate(request: GenerationRequest, progress: (event: ReviewProgress) => void = () => { }) {
        const existing = this.repo.byKey(request.idempotencyKey);
        if (existing) {
            if (existing.courseId !== request.courseId)
                throw new Error('review.idempotency_conflict');
            return existing;
        }
        this.admit();
        const token = randomUUID();
        const data = this.repo.scopeInputs(request.courseId, request.scope);
        const snapshot = resolveScope(request.scope, data).snapshot;
        if (request.retakeAttemptId)
            snapshot.assumptions.push('retakeAttempt:' + request.retakeAttemptId);
        snapshot.size = request.size;
        const artifact = this.repo.create(request, snapshot, token);
        this.launch(artifact.id, token, request, progress);
        return artifact;
    }
    retry(id: string, requestId: string, locale: 'en' | 'zh-Hant', progress: (event: ReviewProgress) => void = () => { }) { this.admit(); const artifact = this.repo.find(id); if (!artifact)
        throw new Error('review.artifact_unavailable'); const retakeId = artifact.resolvedScope.assumptions.find(a => a.startsWith('retakeAttempt:'))?.slice(14); const size=artifact.resolvedScope.size; const token = randomUUID(); if (!this.repo.retry(id, token))
        return artifact; this.launch(id, token, { requestId, courseId: artifact.courseId, kind: artifact.kind, title: artifact.title, scope: artifact.scope, idempotencyKey: id, providerId: artifact.providerId, modelId: artifact.modelId, locale, size, ...(retakeId ? { retakeAttemptId: retakeId } : {}) }, progress); return this.repo.find(id)!; }
    private admit() { if (this.stopped || this.disposed)
        throw new Error('review.suspended'); if (this.active.size >= 2)
        throw new Error('review.busy'); }
    private launch(id: string, token: string, request: GenerationRequest, progress: (event: ReviewProgress) => void) { const controller = new AbortController(); const promise = Promise.resolve().then(() => this.run(id, token, request, controller.signal, progress)).finally(() => { if (this.active.get(id)?.controller === controller)
        this.active.delete(id); }); this.active.set(id, { controller, promise }); }
    private async run(id: string, token: string, request: GenerationRequest, signal: AbortSignal, progress: (event: ReviewProgress) => void) {
        const emit = (stage: ReviewProgress['stage'], completed = 0, total = 1, errorCode: string | null = null) => { try {
            progress({ requestId: request.requestId, artifactId: id, stage, completed, total, errorCode });
        }
        catch { /* A closed originating window does not change persisted state. */ } };
        try {
            emit('resolving');
            signal.throwIfAborted();
            const foundation = new ReviewRepository(this.repo.db), now = this.repo.clock();
            const everyConcept = request.scope.kind === 'weak' ? foundation.computeCourseMastery(request.courseId, now) : undefined;
            const input = this.repo.scopeInputs(request.courseId, request.scope, everyConcept && new Set(everyConcept.filter(c => c.userState !== 'dismissed' && c.mastery.state === 'needs_review').map(c => c.key)));
            const mastery = everyConcept ?? foundation.computeCourseMastery(request.courseId, now, input.concepts.map(c => c.key));
            const byKey = new Map(mastery.map(c => [c.key, c]));
            const resolved = resolveScope(request.scope, input);
            if (resolved.status !== 'resolved')
                throw new Error('review.needs_source_selection');
            const excerpts: Excerpt[] = [];
            let bytes = 0;
            for (const doc of resolved.snapshot.documentIds) {
                signal.throwIfAborted();
                if (excerpts.length === 8 || bytes >= 48000) {
                    resolved.snapshot.assumptions.push('Some sources omitted due to excerpt budget');
                    break;
                }
                const excerpt = await this.deps.readExcerpt(doc, Math.min(6000, 48000 - bytes), signal);
                bytes += Buffer.byteLength(excerpt.text);
                if (excerpt.text.trim())
                    excerpts.push(excerpt);
            }
            if (excerpts.some(e => Buffer.byteLength(e.text) > 6000) || bytes > 48000)
                throw new Error('review.input_limit');
            if (!excerpts.length)
                throw new Error('review.needs_source_selection');
            for (const excerpt of excerpts)
                if (excerpt.truncated)
                    resolved.snapshot.assumptions.push('Source excerpt limited to first 6000 bytes: ' + excerpt.documentId);
            if (request.retakeAttemptId)
                resolved.snapshot.assumptions.push('retakeAttempt:' + request.retakeAttemptId);
            resolved.snapshot.size = request.size;
            resolved.snapshot.sources = excerpts.map(e => ({ documentId: e.documentId, version: e.version, excerptHash: e.excerptHash }));
            this.repo.snapshot(id, token, studyResolvedScopeSchema.parse(resolved.snapshot));
            let concepts = resolved.snapshot.conceptKeys;
            let excludedStems: string[] = [];
            if (request.retakeAttemptId) {
                const retake = new Attempts(this.repo).retake(request.retakeAttemptId);
                const parent = new Attempts(this.repo).get(request.retakeAttemptId);
                if (this.repo.find(parent.artifactId)?.courseId !== request.courseId)
                    throw new Error('review.scope_mismatch');
                concepts = concepts.filter(k => retake.conceptKeys.includes(k));
                excludedStems = retake.excludedStems;
            }
            const weakPoints = foundation.observationsPage({ courseId: request.courseId, limit: 100 }).items.filter(o => o.conceptKey && concepts.includes(o.conceptKey) && o.errorType === 'misconception').map(o => ({ id: o.id, conceptKey: o.conceptKey, text: o.weaknessNote, evidenceQuote: o.evidenceQuote }));
            const blueprint = buildBlueprint(concepts, resolved.snapshot.unitIds.length, request.size);
            const slots = blueprint.slots.map(slot => ({ ...slot, unitId: byKey.get(slot.conceptKey)?.unitId ?? null }));
            if (excludedStems.length > 1000)
                throw new Error('review.retake_limit');
            const plan = notePlan(resolved.snapshot.unitIds.length, concepts.map(key => ({ key, mastery: 1 - (byKey.get(key)?.mastery.risk ?? .5) })), request.scope.kind === 'weak');
            if (request.kind === 'test' && blueprint.status === 'infeasible')
                throw new Error('review.infeasible_blueprint');
            const data = { resolvedScope: resolved.snapshot, excerpts, concepts: concepts.map(key => ({ key, label: byKey.get(key)?.label ?? key, unitId: byKey.get(key)?.unitId ?? null })), weakPoints, plan, blueprint: slots, excludedStems };
            const call = async (prompt: string) => { signal.throwIfAborted(); const estimate = this.deps.estimate(prompt, request); if (estimate.costUsd === undefined)
                throw new Error('review.budget_unknown'); const handle = this.deps.admission.reserve(estimate); let actual = estimate; try {
                emit('generating');
                const output = await this.deps.call(prompt, request, signal, u => { actual = u; });
                if (Buffer.byteLength(output) > 240000)
                    throw new Error('review.output_limit');
                signal.throwIfAborted();
                return output;
            }
            finally {
                this.deps.admission.settle(handle, actual);
            } };
            if (request.kind === 'note') {
                const raw = noteOutput.parse(JSON.parse(await call(notePrompt(data, request.locale))));
                emit('validating');
                const checked = validateTest({ version: 1, items: raw.citations.map((source, i) => ({ id: String(i), conceptKey: concepts[0] ?? 'note', type: 'true_false', stem: 'Citation ' + i, answer: true, explanation: '', source })) }, excerpts);
                if (checked.items.length !== raw.citations.length)
                    throw new Error('review.invalid_sources');
                const allowed = new Set(excerpts.map(e => e.documentId));
                const refs = [...raw.bodyMarkdown.matchAll(/\[src:([^\]]+)\]/g)];
                if (!refs.length || refs.some(m => !allowed.has(m[1]!)))
                    throw new Error('review.invalid_sources');
                const sourceBlocks = raw.citations.map(c => { const fence = '`'.repeat(Math.max(3, ...Array.from(c.quote.matchAll(/`+/g), m => m[0].length + 1))); return c.documentId + ' (' + c.version + ')\n' + fence + 'text\n' + c.quote + '\n' + fence; }).join('\n\n');
                const body = raw.bodyMarkdown + '\n\n## Source excerpts\n\n' + sourceBlocks + '\n\n' + REVIEW_VALIDATION_NOTICE + (raw.omitted.length ? '\n\nNot covered: ' + raw.omitted.join(', ') : '');
                signal.throwIfAborted();
                this.live(request, resolved.snapshot.documentIds);
                this.repo.finish(id, token, { bodyMarkdown: body });
            }
            else {
                const accepted: ReturnType<typeof validateTest>['items'] = [];
                const warnings: string[] = [];
                const plannedMcqCount = slots.filter(s => s.type === 'mcq').length;
                const plannedTrueFalseCount = slots.filter(s => s.type === 'true_false').length;
                let pending = slots;
                for (let round = 0; round < 3 && pending.length; round++) {
                    const next: typeof pending = [];
                    for (let offset = 0; offset < pending.length; offset += 6) {
                        const slots = pending.slice(offset, offset + 6);
                        let raw: unknown;
                        try {
                            raw = JSON.parse(await call(testPrompt({ ...data, blueprint: slots, balance: {
                                remainingMcqPositions: [0, 1, 2, 3].map(position => Math.max(0, Math.max(1, Math.floor(plannedMcqCount * .4)) - accepted.filter(i => i.type === 'mcq' && i.answer === position).length)),
                                remainingTruthValues: Object.fromEntries([true, false].map(value => [String(value), Math.max(0, Math.ceil(plannedTrueFalseCount / 2) - accepted.filter(i => i.type === 'true_false' && i.answer === value).length)])),
                            } }, request.locale)));
                        }
                        catch (error) {
                            if (error instanceof SyntaxError) {
                                next.push(...slots);
                                continue;
                            }
                            throw error;
                        }
                        emit('validating');
                        const gate = validateTest(raw, excerpts, [...excludedStems, ...accepted.map(i => i.stem)], { acceptedItems: accepted, plannedMcqCount, plannedTrueFalseCount });
                        warnings.push(...gate.warnings);
                        for (const slot of slots) {
                            const item = gate.items.find(i => i.id === slot.id && i.conceptKey === slot.conceptKey && i.type === slot.type && i.bloom === slot.bloom && i.difficulty === slot.difficulty && i.unitId === slot.unitId && (!slot.unitId || !!input.units.find(u => u.id === slot.unitId)?.documentIds.includes(i.source.documentId)) && (i.type !== 'mcq' || i.optionRationales?.length === i.options.length));
                            if (item)
                                accepted.push(item);
                            else
                                next.push(slot);
                        }
                    }
                    pending = next;
                }
                for (const slot of pending)
                    warnings.push('Not covered: ' + slot.conceptKey + ' (' + slot.id + ')');
                const items = blueprint.slots.flatMap(slot => accepted.filter(i => i.id === slot.id));
                if (!items.length)
                    throw new Error('review.invalid_output');
                if (items.some((item, i) => i > 0 && items[i - 1]!.conceptKey === item.conceptKey))
                    warnings.push('Dropped items reduced interleaving coverage');
                const test = studyTestSchema.parse({ version: 1, items, excludedStemHashes: excludedStems, warnings, validationNotice: REVIEW_VALIDATION_NOTICE });
                signal.throwIfAborted();
                this.live(request, resolved.snapshot.documentIds);
                this.repo.finish(id, token, { test });
            }
            const final = this.repo.find(id);
            if (final?.status === 'ready')
                emit('ready', 1);
            else if (final?.status === 'interrupted')
                emit('interrupted', 0, 1, final.errorCode);
        }
        catch (error) {
            const code = signal.aborted ? 'review.cancelled' : error instanceof Error && /^review\.[a-z_]+$/.test(error.message) ? error.message : 'review.provider_failed';
            this.repo.fail(id, token, code);
            emit(signal.aborted ? 'interrupted' : 'failed', 0, 1, code);
        }
    }
    private live(request: GenerationRequest, documents: string[]) { const live = this.repo.liveDocuments(request.courseId, documents); if (!documents.every(id => live.includes(id)))
        throw new Error('review.source_changed'); }
    cancel(id: string) { this.repo.cancel(id); this.active.get(id)?.controller.abort(); }
    suspend() { this.stopped = true; for (const id of this.active.keys())
        this.cancel(id); }
    resume() { if (!this.disposed)
        this.stopped = false; }
    async waitForIdle() { await Promise.allSettled([...this.active.values()].map(a => a.promise)); }
    async dispose() { this.disposed = true; this.suspend(); await this.waitForIdle(); this.unregister(); }
}
