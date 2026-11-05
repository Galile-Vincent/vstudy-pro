/**
 * Draft study blocks within daily budgets and current task and exam constraints.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Deterministic planning draft. It fills explicit local study windows and reports work that capacity cannot cover. */
import { assertPlannerAction, localDay, type PlanningContext } from "./planner-policy";
import type { PlannerAction, PlannerTarget } from "./planner";

type PlanAction = Extract<PlannerAction, { type: "make-study-plan" | "plan-today" }>;
export interface DraftOptions {
  timeZone: string;
  dailyBudgetMinutes: number;
  startHour: number;
  endHour: number;
  days: number;
  title: string;
  assumptions: string[];
}
/** Allocate proposed blocks within daily budgets without writing student data. */
export function draftStudyPlan(context: PlanningContext, options: DraftOptions) {
  const horizon = context.now + Math.min(14, options.days) * 86400000;
  const linked = new Set(context.snapshot.tasks.map(t => t.deadlineId));
  const work = [
    ...context.snapshot.tasks.filter(t => t.status !== "done").map(t => ({ title: t.title, courseId: t.courseId, dueAt: t.dueAt, minutes: t.estimateMinutes, target: { kind: "task", id: t.id } as PlannerTarget })),
    ...context.snapshot.exams.map(e => ({ title: e.title, courseId: e.courseId, dueAt: e.date, minutes: Math.max(90, e.scopeTopics.length * 45), target: { kind: "exam", id: e.id } as PlannerTarget })),
    ...context.deadlines.filter(d => !d.submitted && !d.orphaned && !linked.has(d.id)).map(d => ({ title: d.title, courseId: d.courseId, dueAt: d.dueAt, minutes: d.kind === "quiz" ? 90 : 60, target: { kind: "deadline", id: d.id } as PlannerTarget })),
  ].filter(w => !w.dueAt || Date.parse(w.dueAt) <= context.now + 14 * 86400000)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.title.localeCompare(b.title));
  const action: PlanAction = { type: options.days === 1 ? "plan-today" : "make-study-plan", title: options.title, timeZone: options.timeZone, dailyBudgetMinutes: options.dailyBudgetMinutes, assumptions: options.assumptions, blocks: [] };
  const unallocated: { title: string; minutes: number; reason: "overdue" | "capacity" }[] = [];
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: options.timeZone, hour: "numeric", hourCycle: "h23" });
  const firstDay = localDay(context.now, options.timeZone);
  const days: string[] = [];
  const slots = new Map<string, number[]>();
  for (let t = Math.ceil(context.now / 300000) * 300000; t < horizon; t += 300000) {
    const day = localDay(t, options.timeZone);
    if (!days.includes(day)) days.push(day);
    if (days.indexOf(day) >= options.days) break;
    const h = Number(hour.format(new Date(t)));
    if (h >= options.startHour && h < options.endHour) slots.set(day, [...(slots.get(day) ?? []), t]);
  }
  const occupied = [...context.snapshot.blocks];
  const usage = (day: string) => occupied.filter(b => localDay(b.startsAt, options.timeZone) === day).reduce((n, b) => n + b.durationMinutes, 0);
  for (const item of work) {
    let remaining = Math.max(0, item.minutes - occupied.filter(b => b.target?.kind === item.target.kind && b.target.id === item.target.id && Date.parse(b.startsAt) >= context.now).reduce((n, b) => n + b.durationMinutes, 0));
    if (item.dueAt && Date.parse(item.dueAt) <= context.now) {
      if (remaining) unallocated.push({ title: item.title, minutes: remaining, reason: "overdue" });
      continue;
    }
    while (remaining >= 5 && action.blocks.length < 56) {
      const choices = [...slots.keys()].sort((a, b) => usage(a) - usage(b) || a.localeCompare(b));
      let placed = false;
      for (const day of choices) {
        if (options.days === 1 && day !== firstDay) continue;
        const minutes = Math.floor(Math.min(30, remaining, options.dailyBudgetMinutes - usage(day)) / 5) * 5;
        if (minutes < 5) continue;
        const slot = slots.get(day)!.find(start => {
          const end = start + minutes * 60000;
          return (!item.dueAt || end <= Date.parse(item.dueAt)) && localDay(end - 1, options.timeZone) === day
            && Number(hour.format(new Date(end - 1))) < options.endHour
            && !occupied.some(b => start < Date.parse(b.startsAt) + b.durationMinutes * 60000 && end > Date.parse(b.startsAt));
        });
        if (slot === undefined) continue;
        const block = { title: item.title, courseId: item.courseId, target: item.target, startsAt: new Date(slot).toISOString(), durationMinutes: minutes };
        action.blocks.push(block);
        occupied.push({ ...block, id: "draft", planId: null });
        remaining -= minutes;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    if (remaining) unallocated.push({ title: item.title, minutes: remaining, reason: "capacity" });
  }
  if (action.blocks.length) assertPlannerAction(action, context);
  return { action: action.blocks.length ? action : null, unallocated };
}
