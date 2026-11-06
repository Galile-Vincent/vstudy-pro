/** Adjacent concept interactions form episodes in the student's calendar zone. @packageDocumentation */
export const EPISODE_GAP_MS = 6 * 60 * 60 * 1000;
export interface TimedEvidence {id:string;occurredAt:string}
export interface Episode<T> {day:string;startAt:string;endAt:string;observations:T[]}
export function localDay(at:string, timeZone:string):string {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export function buildEpisodes<T extends TimedEvidence>(observations:readonly T[], timeZone = 'UTC'):Episode<T>[] {
  const sorted = [...observations].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
  const episodes:Episode<T>[] = [];
  for (const observation of sorted) {
    const stamp = Date.parse(observation.occurredAt);
    if (!Number.isFinite(stamp)) throw new Error('Invalid evidence timestamp');
    const day = localDay(observation.occurredAt,timeZone), last = episodes.at(-1);
    if (!last || last.day!==day || stamp-Date.parse(last.endAt)>=EPISODE_GAP_MS) episodes.push({day,startAt:observation.occurredAt,endAt:observation.occurredAt,observations:[observation]});
    else { last.observations.push(observation); last.endAt=observation.occurredAt; }
  }
  return episodes;
}
