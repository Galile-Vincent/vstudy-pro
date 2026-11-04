import type { MoodleDeadline } from '../../shared/moodle';
import type { MoodleRepository } from './repository';

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
const stamp = (value: string) => value.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
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
export function calendarText(deadlines: MoodleDeadline[], now = new Date().toISOString()): string {
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VStudy//Moodle//EN','CALSCALE:GREGORIAN',...deadlines.flatMap(item => ['BEGIN:VEVENT',`UID:${item.id}@vstudy`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(item.dueAt)}`,`SUMMARY:${escape(item.title)}`,...(item.url ? [`URL:${escape(item.url)}`] : []),'END:VEVENT']),'END:VCALENDAR',''].map(fold).join('\r\n');
}
