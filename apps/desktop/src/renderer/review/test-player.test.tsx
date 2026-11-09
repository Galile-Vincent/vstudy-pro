// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IpcResponse } from '../../shared/ipc';
import { studyTestSchema } from '../../shared/review-artifacts';
import { resetDraftQueues } from './draft-queue';
import { TestPlayer } from './test-player';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
afterEach(() => { cleanup(); vi.resetAllMocks(); resetDraftQueues(); });
const source = { documentId: '10000000-0000-4000-8000-000000000001', version: 'original' as const, excerptHash: 'a'.repeat(64), quote: 'Source passage' };
const fixtureArtifact = { id: 'artifact', title: 'Practice', test: { version: 1, items: [
 { id: 'a', conceptKey: 'chain', type: 'mcq', stem: 'First question', options: ['A', 'B'], answer: 1, explanation: 'First explanation', source, optionRationales: ['Why A', 'Why B'], nextStep: 'Try another example' },
 { id: 'b', conceptKey: 'product', type: 'cloze', stem: 'Second question', answer: 'product', alternatives: [], explanation: 'Second explanation', source },
 { id: 'c', conceptKey: 'chain', type: 'true_false', stem: 'Third question', answer: true, explanation: 'Third explanation', source },
] } };
const fullTest = studyTestSchema.parse(fixtureArtifact.test);
const artifact = fixtureArtifact as unknown as NonNullable<IpcResponse<'review:artifact:get'>>;
function fixture() {
 let attempt = { id: 'attempt', artifactId: 'artifact', phase: 'answering', answers: {} as Record<string, unknown>, startedAt: '', committedAt: null, confirmedAt: null, results: artifact.test!.items.map(item => ({ itemId: item.id, conceptKey: item.conceptKey, correct: null as boolean | null, reportedBad: false })) };
 invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
  if (channel === 'review:attempt:answer') attempt = { ...attempt, answers: { ...attempt.answers, [String(request.itemId)]: request.answer } };
  if (channel === 'review:attempt:commit') attempt = { ...attempt, phase: request.itemId === 'c' ? 'graded' : 'answering', results: attempt.results.map((r, index) => ({ ...r, correct: request.itemId === r.itemId || !request.itemId || r.correct !== null ? index !== 0 : null, feedback: request.itemId === r.itemId || !request.itemId || r.correct !== null ? fullTest.items[index] : undefined })) };
  if (channel === 'review:attempt:confirm') attempt = { ...attempt, phase: 'confirmed' };
  if (channel === 'review:attempt:report-bad') attempt = { ...attempt, results: attempt.results.map(r => r.itemId === request.itemId ? { ...r, reportedBad: true } : r) };
  return attempt;
 });
}
async function answerAll() {
 fireEvent.click(await screen.findByLabelText('B'));
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByText('First explanation');
 fireEvent.click(screen.getByRole('button', { name: 'review:next_item' }));
 fireEvent.change(await screen.findByLabelText('review:your_answer'), { target: { value: 'product' } });
 fireEvent.click(screen.getByRole('button', { name: 'review:answer_next' }));
 await screen.findByText('Second explanation');
 fireEvent.click(screen.getByRole('button', { name: 'review:next_item' }));
 fireEvent.click(await screen.findByLabelText('review:answer_true'));
 fireEvent.click(screen.getByRole('button', { name: 'review:finish_test' }));
 await screen.findByText('Third explanation');
}
it('persists each answer, hides explanations until commit, and locks all committed answers', async () => {
 fixture(); render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 await screen.findByText('First question');
 expect(screen.queryByText('First explanation')).toBeNull();
 expect(screen.queryByText('Source passage')).toBeNull();
 await answerAll();
 expect(invoke).toHaveBeenCalledWith('review:attempt:answer', { attemptId: 'attempt', itemId: 'b', answer: 'product' });
 expect(invoke).toHaveBeenCalledWith('review:attempt:commit', { attemptId: 'attempt', itemId: 'c' });
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(invoke).not.toHaveBeenCalledWith('review:attempt:confirm', expect.anything());
 fireEvent.click(screen.getByRole('button', { name: 'review:previous_item' }));
 expect(await screen.findByText('Second explanation')).toBeTruthy();
 expect(screen.queryByRole('textbox')).toBeNull();
});
it('shows results, applies review updates only on confirmation, and retakes missed concepts', async () => {
 fixture(); const onRetake = vi.fn(); render(<TestPlayer artifact={artifact} onRetake={onRetake} />); await answerAll();
 fireEvent.click(screen.getByRole('button', { name: 'review:view_results' }));
 expect(await screen.findByText('review:worth_another_look')).toBeTruthy();
 expect(screen.getByRole('button', { name: 'review:retake_missed' }).hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'review:update_review_list' }));
 await screen.findByText('review:review_list_updated');
 fireEvent.click(screen.getByRole('button', { name: 'review:retake_missed' }));
 expect(onRetake).toHaveBeenCalledWith('attempt');
});
it('excludes reported questions and recovers a failed attempt load', async () => {
 fixture(); const responder = invoke.getMockImplementation()!; invoke.mockRejectedValueOnce(new Error('offline'));
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 expect(await screen.findByRole('alert')).toBeTruthy();
 invoke.mockImplementation(responder); fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
 await answerAll(); fireEvent.click(screen.getByRole('button', { name: 'review:report_bad_question' }));
 await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:attempt:report-bad', { attemptId: 'attempt', itemId: 'c' }));
 expect(await screen.findByText('review:question_reported')).toBeTruthy();
});
it('shows loading while an attempt opens', () => {
 invoke.mockReturnValue(new Promise(() => {})); render(<TestPlayer artifact={artifact} onRetake={vi.fn()} />);
 expect(screen.getByRole('status').textContent).toBe('review:loading');
});

it('opens a single attempt under StrictMode', async () => {
 fixture(); render(<StrictMode><TestPlayer artifact={artifact} onRetake={vi.fn()} /></StrictMode>);
 await screen.findByText('First question');
 expect(invoke.mock.calls.filter(([channel]) => channel === 'review:attempt:start')).toHaveLength(1);
});

it('resumes saved answers and committed feedback via get after remount',async()=>{
 fixture();
 invoke.mockImplementation(async(channel:string)=>{
  if(channel==='review:attempt:start') return {id:'saved'};
  return {id:'saved',artifactId:'artifact',phase:'answering',answers:{a:1,b:'draft'},results:fullTest.items.map((item,i)=>({itemId:item.id,conceptKey:item.conceptKey,correct:i===0,reportedBad:false,...(i===0?{feedback:item}:{correct:null})}))};
 });
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()}/>);
 expect((await screen.findByRole('textbox') as HTMLInputElement).value).toBe('draft');
 expect(invoke).toHaveBeenCalledWith('review:attempt:get',{attemptId:'saved'});
 expect(screen.queryByText('Second explanation')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'review:previous_item'}));
 expect(await screen.findByText('First explanation')).toBeTruthy();
});
it('notifies the parent only after review confirmation succeeds', async () => {
 fixture();
 const onConfirmed = vi.fn();
 render(<TestPlayer artifact={artifact} onRetake={vi.fn()} onConfirmed={onConfirmed} />);
 await answerAll();
 fireEvent.click(screen.getByRole('button', { name: 'review:view_results' }));
 expect(onConfirmed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'review:update_review_list' }));
 await screen.findByText('review:review_list_updated');
 expect(onConfirmed).toHaveBeenCalledTimes(1);
});
