import type { MoodleDeadline, MoodleNotification } from '../../shared/moodle';

export function courseAttention(courseId: string, deadlines: MoodleDeadline[], notifications: MoodleNotification[], now = Date.now()) {
  const pending = deadlines.filter(deadline => deadline.courseId === courseId && !deadline.submitted && !deadline.orphaned);
  return {
    latestOverdueAt: pending.filter(deadline => Date.parse(deadline.dueAt) < now).reduce<number | null>((latest,deadline) => Math.max(latest ?? -Infinity,Date.parse(deadline.dueAt)),null),
    overdue: pending.filter(deadline => Date.parse(deadline.dueAt) < now).length,
    unread: notifications.filter(notification => notification.courseId === courseId && !notification.read).length,
    next: pending.filter(deadline => Date.parse(deadline.dueAt) >= now && Date.parse(deadline.dueAt) <= now + 7 * 86400000).sort((a,b) => a.dueAt.localeCompare(b.dueAt))[0],
  };
}
