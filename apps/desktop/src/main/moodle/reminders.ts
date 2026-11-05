/**
 * Deliver due Moodle reminders and serialize calendar events.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import type { MoodleDeadline } from '../../shared/moodle';
import type { MoodleRepository } from './repository';

/** Start due-reminder delivery and return the cleanup used during shutdown. */
export function startReminders(repository: MoodleRepository, notify: (title: string, body: string) => boolean, now: () => number = Date.now) {
  const tick = () => {
    for (const item of repository.reminders()) {
      if (item.orphaned || item.fired || Date.parse(item.remindAt) > now()) continue;
      const deadline = repository.deadlines([item.deadlineId])[0]!;
      if (notify(deadline.title,item.note || deadline.dueAt)) repository.fired(item);
    }
  };
  tick();
  const timer = setInterval(tick,15_000);
  timer.unref();
  return () => clearInterval(timer);
}
const escape = (value: string) => value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r/g,'');
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function fold(line: string): string {
  const lines: string[] = [];
  let part = '';
  for (const char of line) {
    if (Buffer.byteLength(part + char) > 75) { lines.push(part); part = ' '; }
    part += char;
  }
  lines.push(part);
  return lines.join('\r\n');
}
/** Serialize one Moodle deadline as an escaped calendar event. */
export function calendarText(deadlines: MoodleDeadline[], now = new Date().toISOString()): string {
  return calendarEventsText(deadlines.map(d => ({id:d.id,title:d.title,startsAt:d.dueAt,url:d.url})),now);
}
/** Serialize selected Moodle deadlines with deterministic event identifiers. */
export function calendarEventsText(events: {id:string;title:string;startsAt:string;endsAt?:string;url?:string|null}[], now = new Date().toISOString()): string {
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VStudy//Planner//EN','CALSCALE:GREGORIAN',...events.flatMap(item => ['BEGIN:VEVENT',`UID:${item.id}@vstudy`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(item.startsAt)}`,...(item.endsAt ? [`DTEND:${stamp(item.endsAt)}`] : []),`SUMMARY:${escape(item.title)}`,...(item.url ? [`URL:${escape(item.url)}`] : []),'END:VEVENT']),'END:VCALENDAR',''].map(fold).join('\r\n');
}
