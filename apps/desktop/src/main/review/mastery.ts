/** Computed evidence, with decision 5 controlling visibility rather than risk thresholds. @packageDocumentation */
import { buildEpisodes } from './episodes';
export const NEGATIVE_HALF_LIFE_DAYS = 21;
export const POSITIVE_HALF_LIFE_DAYS = 30;
export const SELF_REPORT_WEIGHT = 0.1;
export const UNDERSTOOD_HIDE_DAYS = 14;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;
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
  if (o.signal==='asked' || o.signal==='resolved' || o.resolved) return 0;
  if (o.errorType==='misconception') return 0.8;
  if (o.signal==='gave_up') return o.wrongAttempt ? 0.7 : 0;
  return o.signal==='wrong' ? 0.8 : o.signal==='confused' ? 0.7 : 0;
}
export function computeMastery(observations:readonly MasteryObservation[], options:MasteryOptions):MasteryResult {
  if (!Number.isFinite(options.now)) throw new Error('Invalid mastery clock');
  const rows = observations.filter(o=>!o.dismissed && Date.parse(o.occurredAt)<=options.now);
  const episodes = buildEpisodes(rows,options.timeZone);
  const decay = (at:string,halfLife:number) => 0.5 ** (Math.max(0,options.now-Date.parse(at))/DAY_MS/halfLife);
  let negative=0, positive=0;
  for (const o of rows) {
    const weight = o.evidenceKind==='paraphrase' ? 0.5 : 1;
    negative += negativeWeight(o)*weight*decay(o.occurredAt,NEGATIVE_HALF_LIFE_DAYS);
    if (o.resolved && o.signal==='resolved') positive+=0.8*weight*decay(o.occurredAt,POSITIVE_HALF_LIFE_DAYS);
  }
  for (const item of options.attempts ?? []) {
    if (!item.confirmed || item.reportedBad || Date.parse(item.at)>options.now) continue;
    if (item.correct) positive+=decay(item.at,POSITIVE_HALF_LIFE_DAYS);
    else negative+=decay(item.at,NEGATIVE_HALF_LIFE_DAYS);
  }
  if (options.understoodAt) positive+=SELF_REPORT_WEIGHT*decay(options.understoodAt,POSITIVE_HALF_LIFE_DAYS);
  const negativeEpisodes = episodes.filter(e=>e.observations.some(o=>negativeWeight(o)>0));
  const days = new Set(negativeEpisodes.map(e=>e.day));
  const strong = rows.some(o=>negativeWeight(o)>0 && (o.errorType==='misconception' || (o.signal==='gave_up' && o.wrongAttempt)));
  let state:MasteryResult['state'] = days.size>=2 || strong ? 'needs_review' : episodes.length>=2 ? 'watching' : 'candidate';
  const latest = episodes.at(-1)?.observations.at(-1);
  if (latest?.resolved && latest.signal==='resolved') state='watching';
  if (options.understoodAt && options.now-Date.parse(options.understoodAt)<UNDERSTOOD_HIDE_DAYS*DAY_MS &&
    !rows.some(o=>negativeWeight(o)>0 && Date.parse(o.occurredAt)>Date.parse(options.understoodAt!))) state='watching';
  if (options.userState==='dismissed') state='dismissed';
  const events = [
    ...rows.filter(o=>negativeWeight(o)>0).map(o=>({at:o.occurredAt,correct:false})),
    ...rows.filter(o=>o.resolved && o.signal==='resolved').map(o=>({at:o.occurredAt,correct:true})),
    ...(options.attempts ?? []).filter(a=>a.confirmed && !a.reportedBad && Date.parse(a.at)<=options.now),
  ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at) || Number(a.correct)-Number(b.correct));
  let anchor:number|null=null, successes=0;
  for (const event of events) {
    const at=Date.parse(event.at);
    if (!event.correct) { anchor=at; successes=0; }
    else if (anchor!==null && at-anchor>=DAY_MS) { anchor=at; successes++; }
  }
  const nextReviewAt=state==='dismissed' || anchor===null ? null :
    new Date(anchor + REVIEW_INTERVAL_DAYS[Math.min(successes,REVIEW_INTERVAL_DAYS.length-1)]!*DAY_MS).toISOString();
  return {state,nextReviewAt,risk:(negative+0.3)/(negative+positive+1),negative,positive,episodeCount:episodes.length};
}
