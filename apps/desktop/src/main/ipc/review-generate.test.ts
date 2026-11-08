import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '../../shared/review-generate';
import type { ProviderRegistry } from '../providers';
const userData = vi.hoisted(() => ({ path: '' }));
vi.mock('electron', () => ({ app: { getPath: () => userData.path }, dialog: {}, BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null } }));
import { openStore } from '../db';
import { createIpcRegistrar } from './register';
import { registerReviewGenerateIpc } from './review-generate';
import { ReviewRepository } from '../review/repository';
import { FakeAdmission } from '../review/admission-port';
import type { GenerationService } from '../review/generate';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse())
    await fn(); });
const TEXT = 'Force causes acceleration. Motion changes position.';
type Event = { type: string; [key: string]: unknown };
function setup(stream: (prompt: string, signal: AbortSignal) => AsyncGenerator<Event>, options: { kind?: 'moodle-assignment' } = {}) {
    userData.path = mkdtempSync(join(tmpdir(), 'review-generate-'));
    cleanup.push(() => rmSync(userData.path, { recursive: true, force: true }));
    const store = openStore(':memory:');
    cleanup.push(() => store.close());
    const course = new ReviewRepository(store.db).createCourse({ title: 'Physics' });
    const documentId = randomUUID(), folder = join(userData.path, 'library', documentId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'content.md'), TEXT);
    store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Physics','physics.md',?,'/tmp/source','text/markdown','ready',?,'2026-11-06T00:00:00Z')").run(documentId, 'a'.repeat(64), join(folder, 'content.md'));
    new ReviewRepository(store.db).linkDocument(course.id, documentId, ['Force', 'Motion']);
    if (options.kind) {
        const account = randomUUID(), moodleCourse = randomUUID(), file = randomUUID();
        store.db.prepare("INSERT INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES(?,'school',1,'{}')").run(account);
        store.db.prepare("INSERT INTO moodle_courses(id,accountId,data) VALUES(?,?,'{}')").run(moodleCourse, account);
        store.db.prepare("INSERT INTO moodle_files(id,courseId,url,data,documentId) VALUES(?,?,'https://example.edu/file','{}',?)").run(file, moodleCourse, documentId);
        store.db.prepare('INSERT INTO moodle_course_details(courseId,data) VALUES(?,?)').run(moodleCourse, JSON.stringify({ sections: [{ modules: [{ kind: 'assignment', modname: 'assign', fileIds: [file] }] }] }));
    }
    const providers = { get: () => ({ listModels: async () => [{id:'gpt-5.4',name:'test'}], stream: (request: { prompt: string }, signal: AbortSignal) => stream(request.prompt, signal) }) } as unknown as ProviderRegistry;
    const handlers = new Map<string, (event: never, request: unknown) => unknown>();
    const registrar = createIpcRegistrar({ handle: (channel, handler) => { handlers.set(channel, handler); }, removeHandler: () => undefined }, () => true);
    const admission = new FakeAdmission();
    const service: GenerationService = registerReviewGenerateIpc(registrar, store, new Set(), providers, admission);
    cleanup.push(() => service.dispose());
    const request: GenerationRequest = { requestId: randomUUID(), courseId: course.id, kind: 'note', title: 'Note', scope: { kind: 'documents', documentIds: [documentId] }, idempotencyKey: randomUUID(), providerId: 'openai-api', modelId: 'gpt-5.4', locale: 'en' };
    const ledger = () => store.db.prepare('SELECT count(*) n,coalesce(sum(inputTokens),0) input,coalesce(sum(outputTokens),0) output FROM usage_events').get() as { n: number; input: number; output: number };
    return { store, service, request, admission, ledger, documentId, handlers };
}
const note = (documentId: string) => JSON.stringify({ bodyMarkdown: `Force [src:${documentId}]`, citations: [{ documentId, version: 'original', excerptHash: createHash('sha256').update(TEXT).digest('hex'), quote: 'Force causes acceleration.' }], omitted: [] });
const RESERVED_OUTPUT = 8192;
it('charges the full reservation once when a dispatched call is aborted before any usage event', async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const { service, request, admission, ledger } = setup(async function* (_prompt, signal) {
        started();
        await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        yield { type: 'done' };
    });
    const artifact = service.generate(request);
    await dispatched;
    service.cancel(artifact.id);
    await service.waitForIdle();
    expect(ledger()).toMatchObject({ n: 1, output: RESERVED_OUTPUT });
    expect(admission.pending.size).toBe(0);
    expect(admission.settled).toHaveLength(1);
});
it('charges the full reservation once when the provider fails after partial text', async () => {
    const { service, request, admission, ledger } = setup(async function* () {
        yield { type: 'text-delta', text: 'partial' };
        throw new Error('connection lost');
    });
    const artifact = service.generate(request);
    await service.waitForIdle();
    expect(service.repo.find(artifact.id)?.status).toBe('failed');
    expect(ledger()).toMatchObject({ n: 1, output: RESERVED_OUTPUT });
    expect(admission.pending.size).toBe(0);
    expect(admission.settled).toHaveLength(1);
});
it('replaces the reservation with reported usage on success, and when a stream fails after reporting', async () => {
    const reported = { type: 'usage', usage: { inputTokens: 120, outputTokens: 37, costSource: 'reported' } };
    const { service, request, ledger, documentId } = setup(async function* () {
        yield { type: 'text-delta', text: note(documentId) };
        yield reported;
        yield { type: 'done' };
    });
    const artifact = service.generate(request);
    await service.waitForIdle();
    expect(ledger()).toMatchObject({ n: 1, input: 120, output: 37 });
    expect(service.repo.find(artifact.id)?.status).toBe('ready');
    const failing = setup(async function* () {
        yield reported;
        throw new Error('stream cut');
    });
    failing.service.generate(failing.request);
    await failing.service.waitForIdle();
    expect(failing.ledger()).toMatchObject({ n: 1, input: 120, output: 37 });
});
const sha = () => createHash('sha256').update(TEXT).digest('hex');
it.each([
    ['note', 'review.invalid_sources'],
    ['test', 'review.invalid_output'],
] as const)('refuses a Moodle assignment document as a source for a %s through the production excerpt reader', async (kind, errorCode) => {
    let calls = 0;
    const { service, request, documentId } = setup(async function* (prompt) {
        calls++;
        const data = JSON.parse(prompt.split('<UNTRUSTED_REVIEW_DATA>\n')[1]!.split('\n</UNTRUSTED_REVIEW_DATA>')[0]!);
        const source = { documentId, version: 'original', excerptHash: sha(), quote: 'Force causes acceleration.' };
        yield { type: 'text-delta', text: kind === 'note' ? note(documentId) : JSON.stringify({ version: 1, items: data.blueprint.map((slot: { id: string; type: string }) => ({ ...slot, stem: 'Question ' + slot.id, answer: slot.type === 'mcq' ? 0 : slot.type === 'cloze' ? 'force' : true, explanation: 'source', source, ...(slot.type === 'mcq' ? { options: ['force', 'speed', 'power', 'other'], optionRationales: ['why', 'why', 'why', 'why'] } : slot.type === 'cloze' ? { alternatives: [] } : {}) })) }) };
        yield { type: 'done' };
    }, { kind: 'moodle-assignment' });
    const artifact = service.generate({ ...request, kind });
    await service.waitForIdle();
    expect(service.repo.find(artifact.id)).toMatchObject({ status: 'failed', errorCode, test: null, bodyMarkdown: null });
    expect(calls).toBeGreaterThan(0);
});
it('accepts the same document as a source when no Moodle assignment owns it', async () => {
    const { service, request, documentId } = setup(async function* () {
        yield { type: 'text-delta', text: note(documentId) };
        yield { type: 'done' };
    });
    const artifact = service.generate(request);
    await service.waitForIdle();
    expect(service.repo.find(artifact.id)?.status).toBe('ready');
});

it('rejects an unknown generation model at IPC with a stable code', async () => {
    const stream = vi.fn(async function* () { yield {type:'done'}; });
    const {handlers, request} = setup(stream);
    await expect(handlers.get('review:artifact:generate')!({} as never, {...request, modelId:'unknown'})).rejects.toThrow('review.model_unavailable');
    expect(stream).not.toHaveBeenCalled();
});
it('validates exam history and explanation requests at the IPC boundary',async()=>{
 const {handlers}=setup(async function*(){yield {type:'done'};});
 expect(await handlers.get('review:exam:history')!({} as never,{limit:20})).toEqual({items:[],nextCursor:null});
 await expect(handlers.get('review:exam:history')!({} as never,{courseId:randomUUID()})).rejects.toThrow();
 await expect(handlers.get('review:attempt:explain')!({} as never,{attemptId:randomUUID(),itemId:'q1',locale:'en',answer:'injected'})).rejects.toThrow();
 await expect(handlers.get('review:attempt:explain')!({} as never,{attemptId:randomUUID(),itemId:'q1',locale:'en'})).rejects.toThrow('review.attempt_unavailable');
});
