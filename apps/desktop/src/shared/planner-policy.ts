/**
 * Validate approved planner actions against current targets, timezones, and limits.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Pure approval rules shared by proposal parsing and SQLite writes. Current capacity and ownership always win over proposals. */
import type { MoodleDeadline } from "./moodle";
import { taskSchema } from "./planner";
import type { PlannerAction, PlannerSnapshot, PlannerTarget, PlannerTask, StudyBlock } from "./planner";

export interface PlanningContext {
  snapshot: PlannerSnapshot;
  deadlines: MoodleDeadline[];
  courseIds: string[];
  documentIds: string[];
  now: number;
}
/** Resolve a planner date using the saved IANA timezone. */
export function localDay(value: string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
}
/** A submitted Moodle assignment completes its linked task for planning and presentation. */
export function plannerTaskDone(task: PlannerTask, deadlines: MoodleDeadline[]): boolean {
  return task.status === "done" || deadlines.some(d => d.id === task.deadlineId && d.submitted === true);
}
/** Resolve a planner target only from the current course and student-owned snapshot. */
export function targetInfo(target: PlannerTarget, context: PlanningContext) {
  if (target.kind === "task") {
    const task = context.snapshot.tasks.find(t => t.id === target.id);
    if (!task || task.status === "done") throw new Error("Task is unavailable");
    const source = context.deadlines.find(d => d.id === task.deadlineId);
    if (source?.submitted) throw new Error("Work is already submitted");
    return { courseId: task.courseId, dueAt: source && (!task.dueAt || Date.parse(source.dueAt) < Date.parse(task.dueAt)) ? source.dueAt : task.dueAt, title: task.title };
  }
  if (target.kind === "exam") {
    const exam = context.snapshot.exams.find(e => e.id === target.id);
    if (!exam) throw new Error("Exam is unavailable");
    return { courseId: exam.courseId, dueAt: exam.date, title: exam.title };
  }
  const deadline = context.deadlines.find(d => d.id === target.id && !d.submitted && !d.orphaned);
  if (!deadline) throw new Error("Deadline is unavailable");
  return { courseId: deadline.courseId, dueAt: deadline.dueAt, title: deadline.title };
}

/** Validate current targets, dates, and limits immediately before applying an approved action. */
export function assertPlannerAction(action: PlannerAction, context: PlanningContext, courseId?: string): void {
  const ownsCourse = (id: string | null) => {
    if (id && !context.courseIds.includes(id) || courseId && id !== courseId) throw new Error("Action outside course scope");
  };
  const materials = (ids: string[]) => {
    if (ids.some(id => !context.documentIds.includes(id))) throw new Error("Use ready materials from this course");
  };
  const linkedDeadline = (id: string | null, linkedCourse: string | null, due: string | null, allowSubmitted = false) => {
    if (!id) return;
    const source = context.deadlines.find(d => d.id === id && !d.orphaned && (allowSubmitted || !d.submitted));
    if (!source || source.courseId !== linkedCourse || !due || Date.parse(due) > Date.parse(source.dueAt)) throw new Error("Invalid linked deadline");
  };
  switch (action.type) {
    case "create-task": {
      ownsCourse(action.task.courseId);
      linkedDeadline(action.task.deadlineId, action.task.courseId, action.task.dueAt);
      if (action.task.goalId && !context.snapshot.goals.some(g => g.id === action.task.goalId && g.courseId === action.task.courseId)) throw new Error("Unknown goal");
      return;
    }
    case "update-task": {
      const task = context.snapshot.tasks.find(t => t.id === action.taskId);
      if (!task) throw new Error("Task is unavailable");
      ownsCourse(task.courseId);
      const next = taskSchema.parse({ ...task, ...action.changes });
      ownsCourse(next.courseId);
      linkedDeadline(next.deadlineId, next.courseId, next.dueAt, true);
      if (next.goalId && !context.snapshot.goals.some(g => g.id === next.goalId && g.courseId === next.courseId)) throw new Error("Unknown goal");
      if (next.dueAt && context.snapshot.blocks.some(b => b.target?.kind === "task" && b.target.id === task.id && Date.parse(b.startsAt) + b.durationMinutes * 60000 > Date.parse(next.dueAt!))) throw new Error("Existing blocks finish after the new due time");
      return;
    }
    case "create-exam":
      ownsCourse(action.exam.courseId);
      materials(action.exam.materialIds);
      linkedDeadline(action.exam.deadlineId, action.exam.courseId, action.exam.date);
      if (Date.parse(action.exam.date) <= context.now) throw new Error("Exam must be in the future");
      return;
    case "summarize-course-materials":
    case "generate-practice-quiz":
      materials(action.documentIds);
      return;
    case "set-reminder": {
      const target = targetInfo(action.target, context);
      ownsCourse(target.courseId);
      if (Date.parse(action.remindAt) <= context.now || target.dueAt && Date.parse(action.remindAt) >= Date.parse(target.dueAt)) throw new Error("Reminder must be before the due time and after now");
      return;
    }
  }
  const blocks = action.type === "schedule-study-block" ? [action.block] : action.blocks;
  const occupied = [...context.snapshot.blocks];
  const usage = new Map<string, number>();
  for (const block of occupied) {
    const day = localDay(block.startsAt, action.timeZone);
    usage.set(day, (usage.get(day) ?? 0) + block.durationMinutes);
  }
  for (const block of blocks) {
    ownsCourse(block.courseId);
    const start = Date.parse(block.startsAt), end = start + block.durationMinutes * 60000;
    const day = localDay(start, action.timeZone);
    if (start < context.now || start > context.now + 14 * 86400000) throw new Error("Block must start within the next fourteen days");
    if (day !== localDay(end - 1, action.timeZone)) throw new Error("Block crosses a local day");
    if (action.type === "plan-today" && day !== localDay(context.now, action.timeZone)) throw new Error("Today's plan must stay today");
    if (block.target) {
      const target = targetInfo(block.target, context);
      if (target.courseId !== block.courseId) throw new Error("Block and target courses differ");
      if (target.dueAt && end > Date.parse(target.dueAt)) throw new Error("Block finishes after its due time");
    }
    if (occupied.some(b => start < Date.parse(b.startsAt) + b.durationMinutes * 60000 && end > Date.parse(b.startsAt))) throw new Error("Study blocks overlap");
    const minutes = (usage.get(day) ?? 0) + block.durationMinutes;
    if (minutes > action.dailyBudgetMinutes) throw new Error("Daily study budget exceeded");
    usage.set(day, minutes);
    occupied.push({ ...block, id: "draft", planId: null } satisfies StudyBlock);
  }
}
