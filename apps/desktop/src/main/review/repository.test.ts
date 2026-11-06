import { afterEach, expect, it } from 'vitest';
import { openStore } from '../db';
import { ReviewRepository } from './repository';
const stores: ReturnType<typeof openStore>[] = [];
afterEach(() => stores.splice(0).forEach(s => s.close()));
function setup() { const store = openStore(':memory:'); stores.push(store); return { store, repo: new ReviewRepository(store.db, () => Date.UTC(2030, 0, 1)) }; }
it('keeps study preferences separate and rejects unknown fields', () => {
    const { repo, store } = setup();
    expect(repo.getPrefs().memoryEnabled).toBe(true);
    expect(() => repo.setPrefs({ memoryEnabled: false, extra: true } as never)).toThrow();
    repo.setPrefs({ memoryEnabled: false });
    expect(repo.getPrefs().memoryEnabled).toBe(false);
    expect(store.db.prepare("SELECT count(*) n FROM settings WHERE key='studyPrefs'").get()?.n).toBe(1);
});
it('creates and updates local courses with bounded keyset pages', () => {
    const { repo } = setup();
    const a = repo.createCourse({ title: 'Physics' });
    repo.createCourse({ title: 'Math' });
    expect(repo.updateCourse(a.id, { title: 'Mechanics' }).title).toBe('Mechanics');
    const page = repo.listCourses({ limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect(repo.listCourses({ limit: 1, cursor: page.nextCursor! }).items[0]?.id).not.toBe(page.items[0]?.id);
    repo.archiveCourse(a.id, true);
    expect(repo.getCourse(a.id)?.archivedAt).not.toBeNull();
});
it('normalizes catalog keys, preserves edits and records understood events', () => {
    const { repo, store } = setup();
    const c = repo.createCourse({ title: 'Physics' });
    const concept = repo.addConcept({ courseId: c.id, label: 'ＦＯＲＣＥ' });
    expect(() => repo.addConcept({ courseId: c.id, label: 'force' })).toThrow();
    repo.editConcept(concept.id, { label: 'Force and motion', note: 'Remember units' });
    repo.dismissConcept(concept.id);
    expect(repo.listConcepts({ courseId: c.id }).items[0]?.userState).toBe('dismissed');
    repo.restoreConcept(concept.id);
    repo.understoodConcept(concept.id);
    expect(store.db.prepare('SELECT count(*) n FROM study_concept_events').get()?.n).toBe(2);
    repo.erase();
    expect(repo.listCourses({}).items).toHaveLength(0);
    expect(repo.getPrefs().memoryEnabled).toBe(false);
});
it('shows unassigned live chats and fences reassigned evidence without losing it', () => {
    const { repo, store } = setup();
    const first = repo.createCourse({ title: 'Physics' }), second = repo.createCourse({ title: 'Math' });
    const chat = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222', assistant = '33333333-3333-4333-8333-333333333333', job = '44444444-4444-4444-8444-444444444444', observation = '55555555-5555-4555-8555-555555555555';
    const at = '2030-01-01T00:00:00.000Z';
    store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m',?)").run(chat, at);
    for (const [id, role] of [[user, 'user'], [assistant, 'assistant']])
        store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!, chat, role!, JSON.stringify([{ type: 'text', text: 'Answer', status: 'complete' }]), at);
    expect(repo.inbox({}).items[0]?.conversationId).toBe(chat);
    repo.assignChat(chat, first.id);
    repo.addConcept({ courseId: first.id, label: 'Force' });
    store.db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,status,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,1,'succeeded',?,?,?)").run(job, chat, user, assistant, 'v1', first.id, at, at, at);
    store.db.prepare("INSERT INTO study_observations(id,jobId,courseId,conceptKey,errorType,signal,evidenceQuote,confidence,createdAt) VALUES(?,?,?,'force','misconception','wrong','my answer',1,?)").run(observation, job, first.id, at);
    expect(repo.computeCourseMastery(first.id, Date.parse(at))[0]?.mastery.state).toBe('needs_review');
    repo.excludeChat(chat, true);
    expect(repo.observationsPage({ courseId: first.id }).items).toHaveLength(0);
    repo.excludeChat(chat, false);
    expect(repo.observationsPage({ courseId: first.id }).items).toHaveLength(1);
    repo.assignChat(chat, second.id);
    expect(repo.observationsPage({ courseId: first.id }).items).toHaveLength(0);
    expect(repo.observationsPage({ courseId: second.id }).items[0]).toMatchObject({ id: observation, conceptKey: null, proposedLabel: 'force' });
    expect(store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('lists and edits eligible exchange summaries even when extraction found zero concepts',()=>{
 const {repo,store}=setup();const course=repo.createCourse({title:'Math'});
 const chat='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',assistant='33333333-3333-4333-8333-333333333333',job='44444444-4444-4444-8444-444444444444',at='2030-01-01T00:00:00.000Z';
 store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m',?)").run(chat,at);
 for(const [id,role] of [[user,'user'],[assistant,'assistant']])store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!,chat,role!,JSON.stringify([{type:'text',text:'Answer',status:'complete'}]),at);
 repo.assignChat(chat,course.id);
 store.db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,status,questionSummary,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,1,'succeeded','A plain question',?,?,?)").run(job,chat,user,assistant,'v1',course.id,at,at,at);
 expect(repo.jobsPage({courseId:course.id}).items[0]).toMatchObject({id:job,questionSummary:'A plain question'});
 expect(repo.observationsPage({courseId:course.id}).items).toHaveLength(0);
 expect(()=>repo.editJob(job,{questionSummary:'x'.repeat(241)})).toThrow();
 repo.editJob(job,{questionSummary:'Edited summary'});expect(repo.jobsPage({courseId:course.id}).items[0]?.questionSummary).toBe('Edited summary');
 repo.excludeChat(chat,true);expect(repo.jobsPage({courseId:course.id}).items).toHaveLength(0);
});
it('rejects multibyte aliases that would exceed restore JSON bounds',()=>{
 const {repo}=setup();
 const aliases=Array.from({length:40},(_,i)=>'概念'.repeat(70)+i);
 expect(()=>repo.createCourse({title:'Physics',aliases})).toThrow();
});

it('clears only one exchange summary and its evidence without deleting its chat', () => {
    const { repo, store } = setup();
    const first = repo.createCourse({ title: 'Physics' });
    const chat = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222', assistant = '33333333-3333-4333-8333-333333333333', job = '44444444-4444-4444-8444-444444444444', observation = '55555555-5555-4555-8555-555555555555';
    const at = '2030-01-01T00:00:00.000Z';
    store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m',?)").run(chat, at);
    for (const [id, role] of [[user, 'user'], [assistant, 'assistant']])
        store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!, chat, role!, JSON.stringify([{ type: 'text', text: 'Answer', status: 'complete' }]), at);
    expect(repo.inbox({}).items[0]?.conversationId).toBe(chat);
    repo.assignChat(chat, first.id);
    repo.addConcept({ courseId: first.id, label: 'Force' });
    store.db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,status,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,1,'succeeded',?,?,?)").run(job, chat, user, assistant, 'v1', first.id, at, at, at);
    store.db.prepare("INSERT INTO study_observations(id,jobId,courseId,conceptKey,errorType,signal,evidenceQuote,confidence,createdAt) VALUES(?,?,?,'force','misconception','wrong','my answer',1,?)").run(observation, job, first.id, at);
    expect(repo.computeCourseMastery(first.id, Date.parse(at))[0]?.mastery.state).toBe('needs_review');
    expect(repo.getChatLink(chat)?.courseId).toBe(first.id);
    repo.deleteQuestionSummary(job);
    expect(repo.observationsPage({courseId:first.id}).items).toHaveLength(0);
    expect(repo.computeCourseMastery(first.id,Date.parse(at))[0]?.mastery.state).toBe('candidate');
    expect(store.db.prepare('SELECT questionSummary FROM study_jobs WHERE id=?').get(job)?.questionSummary).toBeNull();
    expect(store.db.prepare('SELECT 1 FROM conversations WHERE id=?').get(chat)).toBeDefined();
    expect(repo.getChatLink(chat)?.courseId).toBe(first.id);
});
