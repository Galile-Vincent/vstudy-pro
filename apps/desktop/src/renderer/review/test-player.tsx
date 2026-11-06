import { useEffect, useRef, useState } from 'react';
import type { IpcResponse } from '../../shared/ipc';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';

type Artifact = NonNullable<IpcResponse<'review:artifact:get'>>;
type Attempt = IpcResponse<'review:attempt:start'>;
type Answer = string | number | boolean | null;

export function TestPlayer({ artifact, onRetake }: { artifact: Artifact; onRetake: (attemptId: string) => void }) {
 const [attempt, setAttempt] = useState<Attempt | null>(null);
 const [index, setIndex] = useState(0);
 const [draft, setDraft] = useState<Answer>(null);
 const [results, setResults] = useState(false);
 const [busy, setBusy] = useState(false);
 const [failed, setFailed] = useState(false);
 const retryAction = useRef<(() => Promise<void>) | null>(null);
 const operation = useRef(false);
 const opening = useRef<{ id: string; promise: Promise<Attempt> } | null>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 const items = artifact.test?.items ?? [];
 const item = items[index];
 const locked = attempt !== null && attempt.phase !== 'answering';
 const run = async (action: () => Promise<void>) => {
  if (operation.current) return;
  operation.current = true; retryAction.current = action; setBusy(true); setFailed(false);
  try { await action(); } catch { setFailed(true); } finally { operation.current = false; setBusy(false); }
 };
 useEffect(() => {
  let active = true;
  const load = async () => {
   if (!opening.current || opening.current.id !== artifact.id) opening.current = { id: artifact.id, promise: desktop.invoke('review:attempt:start', { artifactId: artifact.id }) };
   let next: Attempt;
   try { next = await opening.current.promise; } catch (error) { opening.current = null; throw error; }
   if (active) { setAttempt(next); setDraft(next.answers[items[0]?.id ?? ''] ?? null); }
  };
  retryAction.current = load; setBusy(true); setFailed(false);
  void load().catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setBusy(false); });
  return () => { active = false; };
  // Each player belongs to one artifact; the parent keys it by artifact id.
 }, [artifact.id]);
 useEffect(() => { heading.current?.focus(); }, [index, results]);
 const move = (nextIndex: number) => {
  setIndex(nextIndex); setDraft(attempt?.answers[items[nextIndex]?.id ?? ''] ?? null);
 };
 const submit = () => {
  if (!attempt || !item) return;
  void run(async () => {
   const saved = await desktop.invoke('review:attempt:answer', { attemptId: attempt.id, itemId: item.id, answer: draft });
   setAttempt(saved);
   if (index === items.length - 1) {
    const commit = async () => { setAttempt(await desktop.invoke('review:attempt:commit', { attemptId: saved.id })); };
    retryAction.current = commit;
    await commit();
   } else {
    setIndex(index + 1); setDraft(saved.answers[items[index + 1]!.id] ?? null);
   }
  });
 };
 const missed = attempt?.results.filter(result => result.correct === false && !result.reportedBad) ?? [];
 const reviewed = attempt?.results.filter(result => !result.reportedBad && result.correct !== null) ?? [];
 const result = attempt?.results.find(result => result.itemId === item?.id);
 return <section className="review-test-player" aria-busy={busy}>
  {failed && <p role="alert">{tr('review:error')} <Button disabled={busy} onClick={() => { if (retryAction.current) void run(retryAction.current); }}>{tr('review:retry')}</Button></p>}
  {!attempt && busy && <p role="status">{tr('review:loading')}</p>}
  {attempt && item && !results && <>
   <p role="status">{tr('review:item_progress', { current: index + 1, total: items.length })}</p>
   <h3 ref={heading} tabIndex={-1}>{item.stem}</h3>
   {!locked ? <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <fieldset disabled={busy}><legend>{tr('review:your_answer')}</legend>
     {item.type === 'mcq' && item.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`answer-${artifact.id}`} checked={draft === optionIndex} onChange={() => setDraft(optionIndex)} />{option}</label>)}
     {item.type === 'true_false' && [true, false].map(value => <label key={String(value)}><input type="radio" name={`answer-${artifact.id}`} checked={draft === value} onChange={() => setDraft(value)} />{tr(value ? 'review:answer_true' : 'review:answer_false')}</label>)}
     {item.type === 'cloze' && <label>{tr('review:your_answer')}<input autoComplete="off" maxLength={2000} value={typeof draft === 'string' ? draft : ''} onChange={event => setDraft(event.target.value)} /></label>}
    </fieldset>
    <p>{tr('review:commit_notice')}</p>
    <Button type="submit" disabled={busy || draft === null || draft === ''}>{tr(index === items.length - 1 ? 'review:finish_test' : 'review:answer_next')}</Button>
   </form> : <>
    <p>{tr(result?.reportedBad ? 'review:question_reported' : result?.correct ? 'review:answer_matches' : 'review:worth_another_look')}</p>
    <p>{tr('review:correct_answer')}: {item.type === 'mcq' ? item.options[item.answer] : item.type === 'true_false' ? tr(item.answer ? 'review:answer_true' : 'review:answer_false') : item.answer}</p>
    <p>{item.explanation}</p>
    {item.type === 'mcq' && item.optionRationales?.map((rationale, optionIndex) => <p key={optionIndex}>{item.options[optionIndex]}: {rationale}</p>)}
    {item.nextStep && <p>{item.nextStep}</p>}
    <details><summary><span className="review-chip">{tr('review:source_reference', { document: item.source.documentId, version: item.source.version })}</span></summary><blockquote>{item.source.quote}</blockquote></details>
    <Button disabled={busy || result?.reportedBad} onClick={() => void run(async () => setAttempt(await desktop.invoke('review:attempt:report-bad', { attemptId: attempt.id, itemId: item.id })))}>{tr('review:report_bad_question')}</Button>
   </>}
   <div className="review-actions">
    <Button disabled={busy || index === 0} onClick={() => move(index - 1)}>{tr('review:previous_item')}</Button>
    {locked && index < items.length - 1 && <Button onClick={() => move(index + 1)}>{tr('review:next_item')}</Button>}
    {locked && <Button onClick={() => setResults(true)}>{tr('review:view_results')}</Button>}
   </div>
  </>}
  {attempt && results && <>
   <h3 ref={heading} tabIndex={-1}>{tr('review:results_title')}</h3>
   <p>{tr('review:results_counts', { matched: reviewed.filter(result => result.correct).length, reviewed: reviewed.length, revisit: missed.length })}</p>
   <h4>{tr('review:worth_another_look')}</h4>
   <ul>{[...new Set(attempt.results.map(result => result.conceptKey))].map(key => <li key={key}>{key}: {tr('review:concept_counts', { count: missed.filter(result => result.conceptKey === key).length })}</li>)}</ul>
   <p>{tr('review:confirm_notice')}</p>
   {attempt.phase === 'confirmed' ? <p role="status">{tr('review:review_list_updated')}</p> : <Button disabled={busy} onClick={() => void run(async () => setAttempt(await desktop.invoke('review:attempt:confirm', { attemptId: attempt.id })))}>{tr('review:update_review_list')}</Button>}
   <div className="review-actions"><Button disabled={busy || attempt.phase !== 'confirmed' || !missed.length} onClick={() => onRetake(attempt.id)}>{tr('review:retake_missed')}</Button><Button onClick={() => setResults(false)}>{tr('review:review_answers')}</Button></div>
  </>}
 </section>;
}
