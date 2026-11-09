import { useEffect, useRef, useState } from 'react';
import type { IpcResponse } from '../../shared/ipc';
import { EXAM_COURSE_ID } from '../../shared/review-artifacts';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { ExamPlayer } from '../exams/player';
import { Button } from '../components/ui/button';

const DRAFT_DELAY_MS = 500;
const DRAFT_RETRY_MS = 3000;

type Artifact = NonNullable<IpcResponse<'review:artifact:get'>>;
type Attempt = IpcResponse<'review:attempt:start'>;
type Answer = string | number | boolean | number[] | null;

export function TestPlayer({ artifact, onRetake }: { artifact: Artifact; onRetake: (attemptId: string) => void }) {
 const [attempt, setAttempt] = useState<Attempt | null>(null);
 const [index, setIndex] = useState(0);
 const [drafts, setDrafts] = useState<Record<string, Answer>>({});
 const draftsRef = useRef<Record<string, Answer>>({});
 const [draftError, setDraftError] = useState(false);
 const unsent = useRef<Record<string, Answer>>({});
 const draftTimer = useRef<number | undefined>(undefined);
 const draftQueue = useRef<Promise<void>>(Promise.resolve());
 const attemptId = useRef<string | null>(null);
 const mounted = useRef(false);
 const [gradedEarlier, setGradedEarlier] = useState<string | null>(null);
 const exam = artifact.courseId === EXAM_COURSE_ID;
 const [explanations,setExplanations]=useState<Record<string,string>>({});
 const [results, setResults] = useState(false);
 const [busy, setBusy] = useState(false);
 const [failed, setFailed] = useState(false);
 const retryAction = useRef<(() => Promise<void>) | null>(null);
 const operation = useRef(false);
 const opening = useRef<{ id: string; promise: Promise<Attempt> } | null>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 const feedbackRegion = useRef<HTMLDivElement>(null);
 const justSubmitted = useRef(false);
 const [labels, setLabels] = useState<Record<string, string>>({});
 const items = artifact.test?.items ?? [];
 const item = items[index];
 const draft = item ? drafts[item.id] ?? null : null;
 const flushDrafts = useRef(() => {});
 flushDrafts.current = () => {
  window.clearTimeout(draftTimer.current); draftTimer.current = undefined;
  const id = attemptId.current, batch = Object.entries(unsent.current);
  if (!id || !batch.length) return;
  unsent.current = {};
  draftQueue.current = draftQueue.current.then(async () => {
   let failed = false;
   for (const [itemId, answer] of batch) {
    try { await desktop.invoke('review:attempt:draft', { attemptId: id, itemId, answer }); }
    catch { failed = true; if (!(itemId in unsent.current)) unsent.current[itemId] = answer; }
   }
   if (!mounted.current) return;
   setDraftError(failed);
   if (failed && !draftTimer.current) draftTimer.current = window.setTimeout(() => flushDrafts.current(), DRAFT_RETRY_MS);
  });
 };
 const setDraft = (value: Answer) => {
  if (!item) return;
  draftsRef.current = { ...draftsRef.current, [item.id]: value };
  setDrafts(draftsRef.current);
  unsent.current = { ...unsent.current, [item.id]: value === '' || Array.isArray(value) && !value.length ? null : value };
  window.clearTimeout(draftTimer.current);
  draftTimer.current = window.setTimeout(() => flushDrafts.current(), DRAFT_DELAY_MS);
 };
 useEffect(() => {
  mounted.current = true;
  const leave = () => flushDrafts.current();
  const hide = () => { if (document.visibilityState === 'hidden') leave(); };
  window.addEventListener('pagehide', leave); document.addEventListener('visibilitychange', hide);
  return () => { mounted.current = false; window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hide); leave(); };
 }, []);
 const result = attempt?.results.find(result => result.itemId === item?.id);
 const feedback = result?.feedback;
 const locked = result?.correct !== null && result?.correct !== undefined;
 const run = async (action: () => Promise<void>) => {
  if (operation.current) return;
  operation.current = true; retryAction.current = action; setBusy(true); setFailed(false);
  try { await action(); } catch { setFailed(true); } finally { operation.current = false; setBusy(false); }
 };
 useEffect(() => {
  let active = true;
  const load = async () => {
   if (!opening.current || opening.current.id !== artifact.id) opening.current = { id: artifact.id, promise: desktop.invoke('review:attempt:start', { artifactId: artifact.id }).then(value=>desktop.invoke('review:attempt:get',{attemptId:value.id})) };
   let next: Attempt;
   try { next = await opening.current.promise; } catch (error) { opening.current = null; throw error; }
   if (active) { if(exam&&next.phase!=='answering')setResults(true); setIndex(Math.max(0, items.findIndex(candidate => next.results.find(result => result.itemId === candidate.id)?.correct === null))); setAttempt(next); attemptId.current = next.id; draftsRef.current = { ...next.answers, ...next.drafts }; setDrafts(draftsRef.current); }
  };
  retryAction.current = load; setBusy(true); setFailed(false);
  void load().catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setBusy(false); });
  return () => { active = false; };
  // Each player belongs to one artifact; the parent keys it by artifact id.
 }, [artifact.id]);
 useEffect(() => { heading.current?.focus(); }, [index, results]);
 useEffect(() => {
  if (locked && justSubmitted.current) { justSubmitted.current = false; feedbackRegion.current?.focus(); }
 }, [locked]);
 useEffect(() => {
  if (!results || exam) return;
  let active = true;
  void (async () => {
   const found: Record<string, string> = {};
   let cursor: { at: string; id: string } | undefined;
   do {
    const page = await desktop.invoke('review:concepts:list', { courseId: artifact.courseId, limit: 100, ...(cursor ? { cursor } : {}) });
    for (const concept of page.items) found[concept.key] = concept.label;
    cursor = page.nextCursor ?? undefined;
   } while (cursor && active);
   if (active) setLabels(found);
  })().catch(() => { /* The stable concept key stays visible when labels cannot load. */ });
  return () => { active = false; };
 }, [results, artifact.courseId]);
 const move = (nextIndex: number) => { setIndex(nextIndex); };
 const submit = () => {
  if (!attempt || !item) return;
  const attemptId = attempt.id, itemId = item.id;
  void run(async () => {
   const send = async () => {
    const answer = draftsRef.current[itemId] ?? null;
    unsent.current = Object.fromEntries(Object.entries(unsent.current).filter(([key]) => key !== itemId));
    justSubmitted.current = true;
    try {
     let saved: Attempt;
     try { saved = await desktop.invoke('review:attempt:answer', { attemptId, itemId, answer }); }
     catch (error) {
      const current = await desktop.invoke('review:attempt:get', { attemptId }).catch(() => null);
      const done = current?.results.find(result => result.itemId === itemId)?.correct;
      if (!current || done === null || done === undefined) throw error;
      if (JSON.stringify(current.answers[itemId] ?? null) !== JSON.stringify(answer)) setGradedEarlier(itemId);
      setAttempt(current);
      return;
     }
     setAttempt(saved);
     setAttempt(await desktop.invoke('review:attempt:commit', { attemptId, itemId }));
    } catch (error) { justSubmitted.current = false; throw error; }
   };
   retryAction.current = send;
   await send();
  });
 };
 const missed = attempt?.results.filter(result => result.correct === false && !result.reportedBad) ?? [];
 const reviewed = attempt?.results.filter(result => !result.reportedBad && result.correct !== null) ?? [];
 const explainItem = (itemId: string) => void run(async () => {
  if (!attempt) return;
  const reply = await desktop.invoke('review:attempt:explain', {attemptId: attempt.id, itemId, locale:document.documentElement.lang.startsWith('zh')?'zh-Hant':document.documentElement.lang.startsWith('ja')?'ja':'en'});
  setExplanations(old => ({...old, [itemId]: reply.text}));
 });
 if (exam) return <ExamPlayer
  artifact={artifact} attempt={attempt} index={index} draft={draft} results={results}
  busy={busy} failed={failed} draftError={draftError} explanations={explanations} gradedEarlier={gradedEarlier === item?.id}
  onDraft={setDraft} onMove={move} onSubmit={submit} onResults={setResults} onExplain={explainItem}
  onReport={itemId=>{if(attempt)void run(async()=>setAttempt(await desktop.invoke('review:attempt:report-bad',{attemptId:attempt.id,itemId})));}}
  onRetry={()=>{if(retryAction.current)void run(retryAction.current);}}
 />;
 return <section className="review-test-player" aria-busy={busy}>
  {attempt && <div role="status">{draftError && <p>{tr('review:draft_save_failed')}</p>}</div>}
  {failed && <p role="alert">{tr('review:error')} <Button disabled={busy} onClick={() => { if (retryAction.current) void run(retryAction.current); }}>{tr('review:retry')}</Button></p>}
  {!attempt && busy && <p role="status">{tr('review:loading')}</p>}
  {attempt && item && !results && <>
   <p role="status">{tr('review:item_progress', { current: index + 1, total: items.length })}</p>
   <h3 ref={heading} tabIndex={-1}>{item.stem}</h3>
   {!locked ? <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <fieldset disabled={busy}><legend>{tr('review:your_answer')}</legend>
     {item.type === 'mcq' && item.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`answer-${artifact.id}`} checked={draft === optionIndex} onChange={() => setDraft(optionIndex)} />{option}</label>)}
     {item.type === 'multi_select' && item.options.map((option,optionIndex)=><label key={optionIndex}><input type="checkbox" checked={Array.isArray(draft)&&draft.includes(optionIndex)} onChange={event=>setDraft(event.target.checked?[...(Array.isArray(draft)?draft:[]),optionIndex]:(Array.isArray(draft)?draft:[]).filter(i=>i!==optionIndex))}/>{option}</label>)}
     {item.type === 'calculation' && <label>{tr('review:your_answer')} ({item.unit})<input autoComplete="off" maxLength={2000} value={typeof draft==='string'?draft:''} onChange={event=>setDraft(event.target.value)}/></label>}
     {item.type === 'true_false' && [true, false].map(value => <label key={String(value)}><input type="radio" name={`answer-${artifact.id}`} checked={draft === value} onChange={() => setDraft(value)} />{tr(value ? 'review:answer_true' : 'review:answer_false')}</label>)}
     {item.type === 'cloze' && <label>{tr('review:your_answer')}<input autoComplete="off" maxLength={2000} value={typeof draft === 'string' ? draft : ''} onChange={event => setDraft(event.target.value)} /></label>}
    </fieldset>
    <p>{tr('review:commit_notice')}</p>
    <Button type="submit" disabled={busy || draft === null || draft === ''}>{tr(index === items.length - 1 ? 'review:finish_test' : 'review:answer_next')}</Button>
   </form> : <div ref={feedbackRegion} tabIndex={-1} role="status" aria-live="polite" aria-label={tr('review:item_feedback')}>
    {gradedEarlier === item.id && <p>{tr('review:graded_earlier')}</p>}
    <p>{tr(result?.reportedBad ? 'review:question_reported' : result?.correct ? 'review:answer_matches' : 'review:worth_another_look')}</p>
    <p>{tr('review:correct_answer')}: {feedback?.type === 'mcq' ? feedback.options[feedback.answer] : feedback?.type === 'true_false' ? tr(feedback.answer ? 'review:answer_true' : 'review:answer_false') : feedback?.type==='multi_select'?feedback.answer.map(i=>feedback.options[i]).join(', '):feedback?.answer}</p>
    <p>{feedback?.explanation}</p>
    {feedback&&<Button disabled={busy} onClick={()=>void run(async()=>{const reply=await desktop.invoke('review:attempt:explain',{attemptId:attempt.id,itemId:item.id,locale:document.documentElement.lang.startsWith('zh')?'zh-Hant':document.documentElement.lang.startsWith('ja')?'ja':'en'});setExplanations(old=>({...old,[item.id]:reply.text}));})}>{tr('exams:ask_ai')}</Button>}
    {explanations[item.id]&&<div className="exam-explanation">{explanations[item.id]}</div>}
    {feedback?.type === 'mcq' && feedback.optionRationales?.map((rationale, optionIndex) => <p key={optionIndex}>{feedback.options[optionIndex]}: {rationale}</p>)}
    {feedback?.nextStep && <p>{feedback?.nextStep}</p>}
    {feedback && <details><summary><span className="review-chip">{tr('review:source_reference', { document: feedback.source.documentId, version: feedback.source.version })}</span></summary><blockquote>{feedback.source.quote}</blockquote></details>}
    <Button disabled={busy || result?.reportedBad} onClick={() => void run(async () => setAttempt(await desktop.invoke('review:attempt:report-bad', { attemptId: attempt.id, itemId: item.id })))}>{tr('review:report_bad_question')}</Button>
   </div>}
   <div className="review-actions">
    <Button disabled={busy || index === 0} onClick={() => move(index - 1)}>{tr('review:previous_item')}</Button>
    {locked && index < items.length - 1 && <Button onClick={() => move(index + 1)}>{tr('review:next_item')}</Button>}
    {attempt.phase !== 'answering' && <Button onClick={() => setResults(true)}>{tr('review:view_results')}</Button>}
   </div>
  </>}
  {attempt && results && <>
   <h3 ref={heading} tabIndex={-1}>{tr('review:results_title')}</h3>
   <p>{tr('review:results_counts', { matched: reviewed.filter(result => result.correct).length, reviewed: reviewed.length, revisit: missed.length })}</p>

   <h4>{tr('review:worth_another_look')}</h4>
   <ul>{[...new Set(missed.map(result => result.conceptKey))].map(key => <li key={key}>{tr('review:concept_missed', { label: labels[key] ?? key, count: missed.filter(result => result.conceptKey === key).length })}</li>)}</ul>
   {!exam&&<><p>{tr('review:confirm_notice')}</p>
   {attempt.phase === 'confirmed' ? <p role="status">{tr('review:review_list_updated')}</p> : <Button disabled={busy} onClick={() => void run(async () => setAttempt(await desktop.invoke('review:attempt:confirm', { attemptId: attempt.id })))}>{tr('review:update_review_list')}</Button>}
   </>}
   <div className="review-actions">{!exam&&<Button disabled={busy || attempt.phase !== 'confirmed' || !missed.length} onClick={() => onRetake(attempt.id)}>{tr('review:retake_missed')}</Button>}<Button onClick={() => setResults(false)}>{tr('review:review_answers')}</Button></div>
  </>}
 </section>;
}
