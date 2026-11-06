/** Weights and thresholds are design parameters, not research findings. @packageDocumentation */
import { buildEpisodes, studyDay } from './episodes';
export const NEGATIVE_HALF_LIFE_DAYS = 21;
export const POSITIVE_HALF_LIFE_DAYS = 30;
export const SELF_REPORT_WEIGHT = 0.1;
export const UNDERSTOOD_HIDE_DAYS = 14;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;
export const MASTERY_WEIGHTS = {wrong:0.8,misconception:0.8,gaveUpWithAttempt:0.7,confused:0.4,slip:0.3,wrongThenFixed:0.3,paraphraseFactor:0.5,resolvedPositive:0.8,quiz:1} as const;
export const ACTIVE_NEGATIVE_THRESHOLD = 0.6;
export const REVIEW_SESSION_THRESHOLD = 2;
export const CLEAR_CORRECT_COUNT = 2;
export const CLEAR_SPACING_DAYS = 3;
export const RISK_PRIOR_NEGATIVE = 0.3;
export const RISK_PRIOR_TOTAL = 1;
export const SPACING_SUCCESS_GAP_DAYS = 1;
const DAY_MS = 86_400_000;
export interface MasteryObservation {
  id:string;jobId:string;occurredAt:string;errorType:'none'|'slip'|'mistake'|'misconception'|'gap';
  signal:'asked'|'confused'|'wrong'|'gave_up'|'resolved';evidenceKind:'quote'|'paraphrase';
  confidence:number;resolved:boolean;dismissed?:boolean;wrongAttempt?:boolean;
}
export interface MasteryAttempt {at:string;correct:boolean;confirmed:boolean;reportedBad?:boolean}
export interface MasteryOptions {now:number;timeZone?:string;userState?:'none'|'dismissed';understoodAt?:string|null;attempts?:readonly MasteryAttempt[]}
export interface MasteryResult {state:'candidate'|'watching'|'needs_review'|'dismissed';risk:number;negative:number;positive:number;episodeCount:number;nextReviewAt:string|null}
function negativeWeight(o:MasteryObservation):number {
  if (o.signal==='asked' || o.signal==='resolved') return 0;
  if (o.resolved) return MASTERY_WEIGHTS.wrongThenFixed;
  if (o.errorType==='slip') return MASTERY_WEIGHTS.slip;
  if (o.errorType==='misconception') return MASTERY_WEIGHTS.misconception;
  if (o.signal==='gave_up') return o.wrongAttempt ? MASTERY_WEIGHTS.gaveUpWithAttempt : 0;
  return o.signal==='wrong' ? MASTERY_WEIGHTS.wrong : o.signal==='confused' ? MASTERY_WEIGHTS.confused : 0;
}
export function computeMastery(observations:readonly MasteryObservation[], options:MasteryOptions):MasteryResult {
  if (!Number.isFinite(options.now)) throw new Error('Invalid mastery clock');
  const originalRows = observations.filter(o=>!o.dismissed && Date.parse(o.occurredAt)<=options.now);
  const originallyResolved=new Set(originalRows.filter(o=>o.resolved).map(o=>o.id));
  const originalEpisodes = buildEpisodes(originalRows,options.timeZone);
  // A correct restatement after help reduces the earlier error in the same session.
  const rows=originalEpisodes.flatMap(e=>{
    const fixedAt=Math.max(0,...e.observations.filter(o=>o.resolved).map(o=>Date.parse(o.occurredAt)));
    return e.observations.map(o=>negativeWeight(o)>0 && Date.parse(o.occurredAt)<fixedAt ? {...o,resolved:true} : o);
  });
  const episodes = buildEpisodes(rows,options.timeZone);
  const confirmed=(options.attempts ?? []).filter(a=>a.confirmed && !a.reportedBad && Date.parse(a.at)<=options.now);
  const decay = (at:string,halfLife:number) => 0.5 ** (Math.max(0,options.now-Date.parse(at))/DAY_MS/halfLife);
  let negative=0, positive=0;
  for (const episode of episodes) {
    let correctedNegative=0;
    for (const o of episode.observations) {
      const weight = o.evidenceKind==='paraphrase' ? MASTERY_WEIGHTS.paraphraseFactor : 1;
      const contribution=negativeWeight(o)*weight*decay(o.occurredAt,NEGATIVE_HALF_LIFE_DAYS);
      // Several guesses before one successful restatement are one reduced signal.
      if (o.resolved) correctedNegative=Math.max(correctedNegative,contribution);
      else negative+=contribution;
      if (o.resolved) positive+=MASTERY_WEIGHTS.resolvedPositive*weight*decay(o.occurredAt,POSITIVE_HALF_LIFE_DAYS);
    }
    negative+=correctedNegative;
  }
  for (const item of confirmed) {
    if (item.correct) positive+=MASTERY_WEIGHTS.quiz*decay(item.at,POSITIVE_HALF_LIFE_DAYS);
    else negative+=MASTERY_WEIGHTS.quiz*decay(item.at,NEGATIVE_HALF_LIFE_DAYS);
  }
  if (options.understoodAt) positive+=SELF_REPORT_WEIGHT*decay(options.understoodAt,POSITIVE_HALF_LIFE_DAYS);
  const negativeEpisodes = episodes.filter(e=>e.observations.some(o=>negativeWeight(o)>0));
  const days = new Set(negativeEpisodes.map(e=>e.day));
  const strong = rows.some(o=>!o.resolved && o.errorType!=='slip' && negativeWeight(o)>0 && (o.errorType==='misconception' || (o.signal==='gave_up' && o.wrongAttempt)));
  const wrongQuizzes=confirmed.filter(a=>!a.correct);
  const quizWrongDays=new Set(wrongQuizzes.map(a=>studyDay(a.at,options.timeZone))).size;
  const lastNegativeAt=Math.max(0,...rows.filter(o=>!o.resolved && negativeWeight(o)>0).map(o=>Date.parse(o.occurredAt)),...wrongQuizzes.map(a=>Date.parse(a.at)));
  const correctSince=confirmed.filter(a=>a.correct && Date.parse(a.at)>lastNegativeAt).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const cleared=correctSince.length>=CLEAR_CORRECT_COUNT && Date.parse(correctSince.at(-1)!.at)-Date.parse(correctSince[0]!.at)>=CLEAR_SPACING_DAYS*DAY_MS;
  let state:MasteryResult['state'] = !cleared && negative>=ACTIVE_NEGATIVE_THRESHOLD && (days.size>=REVIEW_SESSION_THRESHOLD || strong || quizWrongDays>=REVIEW_SESSION_THRESHOLD) ? 'needs_review' : episodes.length>=REVIEW_SESSION_THRESHOLD || confirmed.length>=REVIEW_SESSION_THRESHOLD ? 'watching' : 'candidate';
  const latest = episodes.at(-1)?.observations.at(-1);
  if (latest?.resolved && Date.parse(latest.occurredAt)>=lastNegativeAt) state='watching';
  if (options.understoodAt && options.now-Date.parse(options.understoodAt)<UNDERSTOOD_HIDE_DAYS*DAY_MS && lastNegativeAt<=Date.parse(options.understoodAt)) state='watching';
  if (options.userState==='dismissed') state='dismissed';
  const events = [
    ...rows.filter(o=>!o.resolved && negativeWeight(o)>0).map(o=>({at:o.occurredAt,correct:false})),
    ...rows.filter(o=>originallyResolved.has(o.id)).map(o=>({at:o.occurredAt,correct:true})),
    ...confirmed,
  ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at) || Number(a.correct)-Number(b.correct));
  let anchor:number|null=null, successes=0;
  for (const event of events) {
    const at=Date.parse(event.at);
    if (!event.correct) { anchor=at; successes=0; }
    else if (anchor!==null && at-anchor>=SPACING_SUCCESS_GAP_DAYS*DAY_MS) { anchor=at; successes++; }
  }
  const nextReviewAt=state==='dismissed' || anchor===null ? null :
    new Date(anchor + REVIEW_INTERVAL_DAYS[Math.min(successes,REVIEW_INTERVAL_DAYS.length-1)]!*DAY_MS).toISOString();
  return {state,nextReviewAt,risk:(negative+RISK_PRIOR_NEGATIVE)/(negative+positive+RISK_PRIOR_TOTAL),negative,positive,episodeCount:episodes.length};
}
