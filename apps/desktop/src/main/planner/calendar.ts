/**
 * Serialize approved planner blocks as calendar events.
 * Owned by main/planner.
 * Student data survives Moodle pruning; agent proposals require explicit validated approval.
 * @packageDocumentation
 */
/** Calendar export resolves IDs against current local state and retains stable event UIDs. */
import type { z } from "zod";
import type { plannerCalendarSchema, PlannerSnapshot } from "../../shared/planner";
import type { MoodleDeadline } from "../../shared/moodle";
import { calendarEventsText } from "../moodle/reminders";

/** Resolve selected planner items against current state and export calendar timestamps in UTC. */
export function plannerCalendar(snapshot: PlannerSnapshot, deadlines: MoodleDeadline[], selection: z.infer<typeof plannerCalendarSchema>) {
  const events = [
    ...(selection.deadlineIds ?? []).map(id => {
      const d = deadlines.find(d => d.id === id);
      if (!d) throw new Error("Deadline is unavailable");
      return { id, title: d.title, startsAt: d.dueAt };
    }),
    ...(selection.taskIds ?? []).map(id => {
      const t = snapshot.tasks.find(t => t.id === id);
      if (!t?.dueAt) throw new Error("Task needs a due time to export");
      return { id, title: t.title, startsAt: t.dueAt };
    }),
    ...(selection.examIds ?? []).map(id => {
      const e = snapshot.exams.find(e => e.id === id);
      if (!e) throw new Error("Exam is unavailable");
      return { id, title: e.title, startsAt: e.date };
    }),
    ...(selection.blockIds ?? []).map(id => {
      const b = snapshot.blocks.find(b => b.id === id);
      if (!b) throw new Error("Study block is unavailable");
      return { id, title: b.title, startsAt: b.startsAt, endsAt: new Date(Date.parse(b.startsAt) + b.durationMinutes * 60000).toISOString() };
    }),
  ];
  if (!events.length || events.length > 56) throw new Error("Select between one and fifty-six calendar items");
  return calendarEventsText([...new Map(events.map(e => [e.id, e])).values()]);
}
