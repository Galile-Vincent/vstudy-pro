/** Episode boundaries are design parameters, not research findings. @packageDocumentation */
export const EPISODE_GAP_MS = 6 * 60 * 60 * 1000;
export const STUDY_DAY_OFFSET_MS = 4 * 60 * 60 * 1000;
export interface TimedEvidence {id:string;occurredAt:string}
export interface Episode<T> {day:string;startAt:string;endAt:string;observations:T[]}
const dayFormats = new Map<string,Intl.DateTimeFormat>();
export function localDay(at:string, timeZone:string):string {
  let format = dayFormats.get(timeZone);
  if (!format) { format = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}); dayFormats.set(timeZone,format); }
  const parts = format.formatToParts(new Date(at));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export function studyDay(at:string,timeZone='UTC'):string {
  return localDay(new Date(Date.parse(at)-STUDY_DAY_OFFSET_MS).toISOString(),timeZone);
}
export function buildEpisodes<T extends TimedEvidence>(observations:readonly T[], timeZone = 'UTC'):Episode<T>[] {
  const sorted = [...observations].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
  const episodes:Episode<T>[] = [];
  for (const observation of sorted) {
    const stamp = Date.parse(observation.occurredAt);
    if (!Number.isFinite(stamp)) throw new Error('Invalid evidence timestamp');
    const day = studyDay(observation.occurredAt,timeZone), last = episodes.at(-1);
    if (!last || stamp-Date.parse(last.endAt)>=EPISODE_GAP_MS) episodes.push({day,startAt:observation.occurredAt,endAt:observation.occurredAt,observations:[observation]});
    else { last.observations.push(observation); last.endAt=observation.occurredAt; }
  }
  return episodes;
}
