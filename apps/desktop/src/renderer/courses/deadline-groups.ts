import type { MoodleDeadline } from '../../shared/moodle';

export function catalogDeadlines(items: MoodleDeadline[], now: number) {
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  const pending = items.filter(d => !d.submitted && !d.orphaned);
  return {
    overdue: pending.filter(d => Date.parse(d.dueAt) < now)
      .sort((a, b) => Date.parse(b.dueAt) - Date.parse(a.dueAt)),
    dueSoon: pending.filter(d => Date.parse(d.dueAt) >= now &&
      Date.parse(d.dueAt) <= end.getTime())
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    undated: pending.filter(d => !Number.isFinite(Date.parse(d.dueAt))),
  };
}
