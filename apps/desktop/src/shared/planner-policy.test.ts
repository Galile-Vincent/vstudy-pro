import { expect, it } from "vitest";
import { assertPlannerAction, localDay } from "./planner-policy";
import { plannerActionSchema, timeZoneSchema } from "./planner";
import { id, studentContext, task } from "../main/planner/__fixtures__/student";
it("uses local days across Taipei midnight and both daylight saving transitions", () => {
  expect(localDay("2030-01-01T17:00:00Z", "Asia/Taipei")).toBe("2030-01-02");
  expect(localDay("2026-03-08T09:59:00Z", "America/Los_Angeles")).toBe("2026-03-08");
  expect(localDay("2026-03-08T10:01:00Z", "America/Los_Angeles")).toBe("2026-03-08");
  expect(localDay("2026-11-01T08:30:00Z", "America/Los_Angeles")).toBe(localDay("2026-11-01T09:30:00Z", "America/Los_Angeles"));
  expect(timeZoneSchema.safeParse("Asia/Invented").success).toBe(false);
});
it("rejects a tomorrow block in today's plan and a block crossing midnight in the specified zone", () => {
  const context = studentContext();
  const block = { title: "Study", courseId: id(1), target: null, startsAt: "2030-01-02T10:00:00Z", durationMinutes: 30 };
  const plan = { type: "plan-today" as const, title: "Today", timeZone: "UTC", dailyBudgetMinutes: 60, assumptions: ["Free time"], blocks: [block] };
  expect(() => assertPlannerAction(plan, context)).toThrow("today");
  expect(() => assertPlannerAction({ type: "schedule-study-block", timeZone: "Asia/Taipei", dailyBudgetMinutes: 60, block: { ...block, startsAt: "2030-01-01T15:45:00Z" } }, context)).toThrow("crosses");
});
it("keeps a linked task within Moodle's current deadline and rejects unsupported action fields", () => {
  const context = studentContext(); context.snapshot.tasks.push(task());
  expect(() => assertPlannerAction({ type: "update-task", taskId: id(4), changes: { dueAt: "2030-01-04T00:00:00Z" } }, context)).toThrow("linked deadline");
  expect(plannerActionSchema.safeParse({ type: "update-task", taskId: id(4), changes: {} }).success).toBe(false);
  expect(plannerActionSchema.safeParse({ type: "create-task", task: { title: "Study", courseId: null, dueAt: null, estimateMinutes: -30 }, tool: "delete" }).success).toBe(false);
});
