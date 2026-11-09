import type { IpcResponse } from '../../shared/ipc';
import { EXAM_COURSE_ID, studyTestSchema } from '../../shared/review-artifacts';

type Artifact = NonNullable<IpcResponse<'review:artifact:get'>>;
type Request = Record<string, unknown>;
type Answer = string | number | boolean | number[] | null;

const source = { documentId: '10000000-0000-4000-8000-000000000001', version: 'original' as const, excerptHash: 'a'.repeat(64), quote: 'Source passage' };
export const fakeTest = studyTestSchema.parse({ version: 1, items: [1, 2, 3].map(n => (
 { id: `q${n}`, conceptKey: 'chain', type: 'mcq', stem: `Question ${n}`, options: ['Alpha', 'Beta'], answer: 1, explanation: `Explanation ${n}`, source }
)) });
export const fakeArtifact = (exam: boolean) => ({ id: 'artifact', courseId: exam ? EXAM_COURSE_ID : '00000000-0000-4000-8000-000000000001', title: 'Practice', status: 'ready', createdAt: '2026-11-08T00:00:00.000Z', resolvedScope: { documentIds: [] }, test: fakeTest }) as unknown as Artifact;

export type FakeAttemptServer = ReturnType<typeof fakeAttemptServer>;

export function fakeAttemptServer(options: { commitFailures?: number; draftFailures?: number; failures?: Record<string, number> } = {}) {
 const state = { answers: {} as Record<string, Answer>, drafts: {} as Record<string, Answer>, draftSeqs: {} as Record<string, number>, graded: {} as Record<string, boolean>, commitFailures: options.commitFailures ?? 0, draftFailures: options.draftFailures ?? 0 };
 const calls: Array<{ channel: string; request: Request }> = [];
 const failures = { ...options.failures };
 const view = () => ({
  id: 'attempt', artifactId: 'artifact', phase: Object.keys(state.graded).length === fakeTest.items.length ? 'graded' : 'answering',
  answers: { ...state.answers }, drafts: { ...state.drafts }, draftSeqs: { ...state.draftSeqs }, startedAt: '2026-11-08T00:00:00.000Z', committedAt: null, confirmedAt: null,
  results: fakeTest.items.map(item => ({ itemId: item.id, conceptKey: item.conceptKey, correct: item.id in state.graded ? state.graded[item.id]! : null, reportedBad: false, ...(item.id in state.graded ? { feedback: item } : {}) })),
 });
 const invoke = async (channel: string, request: Request = {}) => {
  calls.push({ channel, request });
  if (failures[channel] && failures[channel]! > 0) { failures[channel]!--; throw new Error('offline'); }
  const itemId = String(request.itemId);
  switch (channel) {
   case 'review:attempt:start': return { id: 'attempt' };
   case 'review:attempt:answer':
    if (itemId in state.graded) throw new Error('review.answers_locked');
    state.answers[itemId] = request.answer as Answer; delete state.drafts[itemId]; delete state.draftSeqs[itemId]; return view();
   case 'review:attempt:draft': {
    if (state.draftFailures > 0) { state.draftFailures--; throw new Error('offline'); }
    if (!fakeTest.items.some(item => item.id === itemId)) throw new Error('review.item_unavailable');
    if (view().phase !== 'answering' || itemId in state.graded) return view();
    const seq = typeof request.seq === 'number' ? request.seq : undefined;
    if (seq !== undefined && seq < (state.draftSeqs[itemId] ?? -1)) return view();
    if (seq !== undefined) state.draftSeqs[itemId] = seq;
    if (request.answer === null) delete state.drafts[itemId]; else state.drafts[itemId] = request.answer as Answer;
    return view();
   }
   case 'review:attempt:commit': {
    if (state.commitFailures > 0) { state.commitFailures--; throw new Error('offline'); }
    const item = fakeTest.items.find(candidate => candidate.id === itemId)!;
    state.graded[itemId] = state.answers[itemId] === item.answer; delete state.drafts[itemId]; delete state.draftSeqs[itemId];
    return view();
   }
   case 'review:concepts:list': return { items: [], nextCursor: null };
   default: return view();
  }
 };
 return { invoke, state, calls, view, called: (channel: string) => calls.filter(call => call.channel === channel) };
}
