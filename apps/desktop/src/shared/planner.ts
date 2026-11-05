/**
 * Define student-owned goals, tasks, exams, blocks, and explicit approval contracts.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Student-owned planning records and strict proposals. UTC instants cross IPC; local days use an explicit IANA zone. */
import { z } from "zod";

const id = z.string().uuid();
const title = z.string().trim().min(1).max(200);
const instant = z.string().datetime();
export const timeZoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Unknown time zone");
export const plannerTargetSchema = z.object({ kind: z.enum(["task", "exam", "deadline"]), id }).strict();
export type PlannerTarget = z.infer<typeof plannerTargetSchema>;

export const taskInputSchema = z.object({
  title, courseId: id.nullable(), dueAt: instant.nullable(),
  estimateMinutes: z.number().int().min(5).max(2880),
  deadlineId: id.nullable().default(null), goalId: id.nullable().default(null),
}).strict();
export const taskSchema = taskInputSchema.extend({
  id, status: z.enum(["todo", "doing", "done"]), source: z.enum(["moodle", "user", "agent"]),
  createdAt: instant, updatedAt: instant,
});
export type PlannerTask = z.infer<typeof taskSchema>;
export const taskPatchSchema = taskInputSchema.omit({ deadlineId: true }).partial().extend({ status: taskSchema.shape.status.optional() }).strict()
  .refine(value => Object.keys(value).length > 0, "Empty task update");
export const examInputSchema = z.object({
  title, courseId: id.nullable(), date: instant,
  scopeTopics: z.array(title).max(40), materialIds: z.array(id).max(8),
  deadlineId: id.nullable().default(null),
}).strict();
export const examSchema = examInputSchema.extend({ id, createdAt: instant });
export type PlannerExam = z.infer<typeof examSchema>;
export const goalSchema = z.object({ id, title, courseId: id.nullable(), targetDate: instant.nullable(), status: z.enum(["active", "achieved"]) }).strict();
export type PlannerGoal = z.infer<typeof goalSchema>;
export const blockInputSchema = z.object({
  title, courseId: id.nullable(), target: plannerTargetSchema.nullable(), startsAt: instant,
  durationMinutes: z.number().int().min(5).max(240),
}).strict();
export const studyBlockSchema = blockInputSchema.extend({ id, planId: id.nullable() });
export type StudyBlock = z.infer<typeof studyBlockSchema>;
export const planFields = {
  title, timeZone: timeZoneSchema, dailyBudgetMinutes: z.number().int().min(15).max(480),
  assumptions: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  blocks: z.array(blockInputSchema).min(1).max(56),
};
export const studyPlanSchema = z.object(planFields).omit({ blocks: true }).extend({ id, createdAt: instant }).strict();
export type StudyPlan = z.infer<typeof studyPlanSchema>;
export const plannerReminderSchema = z.object({ id, target: plannerTargetSchema, remindAt: instant, note: z.string().max(280), fired: z.boolean() }).strict();
export const plannerSnapshotSchema = z.object({
  tasks: z.array(taskSchema), exams: z.array(examSchema), goals: z.array(goalSchema),
  plans: z.array(studyPlanSchema), blocks: z.array(studyBlockSchema), reminders: z.array(plannerReminderSchema),
}).strict();
export type PlannerSnapshot = z.infer<typeof plannerSnapshotSchema>;
export const emptyPlanner = (): PlannerSnapshot => ({ tasks: [], exams: [], goals: [], plans: [], blocks: [], reminders: [] });
/** Bound selected document IDs and optional excerpts; main checks ready state and course membership. */
export const materialRequestSchema = z.object({ mode: z.enum(["summary", "quiz"]), documentIds: z.array(id).min(1).max(6) }).strict();
export type MaterialRequest = z.infer<typeof materialRequestSchema>;

export const plannerActionSchemas = [
  z.object({ type: z.literal("create-task"), task: taskInputSchema }).strict(),
  z.object({ type: z.literal("update-task"), taskId: id, changes: taskPatchSchema }).strict(),
  z.object({ type: z.literal("schedule-study-block"), block: blockInputSchema, timeZone: timeZoneSchema, dailyBudgetMinutes: planFields.dailyBudgetMinutes }).strict(),
  z.object({ type: z.literal("create-exam"), exam: examInputSchema }).strict(),
  z.object({ type: z.literal("make-study-plan"), ...planFields }).strict(),
  z.object({ type: z.literal("plan-today"), ...planFields }).strict(),
  z.object({ type: z.literal("set-reminder"), target: plannerTargetSchema, remindAt: instant, note: z.string().max(280) }).strict(),
  z.object({ type: z.literal("summarize-course-materials"), documentIds: materialRequestSchema.shape.documentIds }).strict(),
  z.object({ type: z.literal("generate-practice-quiz"), documentIds: materialRequestSchema.shape.documentIds }).strict(),
] as const;
/** Proposed planner mutations are data until the user approves and main revalidates current state. */
export const plannerActionSchema = z.discriminatedUnion("type", plannerActionSchemas);
export type PlannerAction = z.infer<typeof plannerActionSchema>;
export const plannerCalendarSchema = z.object({
  deadlineIds: z.array(id).max(50).optional(), taskIds: z.array(id).max(50).optional(),
  examIds: z.array(id).max(50).optional(), blockIds: z.array(id).max(56).optional(),
}).strict();
export const exportCalendarActionSchema = plannerCalendarSchema.extend({ type: z.literal("export-calendar") });
/** Transport contracts for student-owned planning reads, approved writes, and calendar export. */
export const plannerIpc = {
  "planner:export-calendar": { request: plannerCalendarSchema, response: z.object({ saved: z.boolean() }).strict() },
  "planner:snapshot": { request: z.object({}).strict(), response: plannerSnapshotSchema },
  "planner:approve": {
    request: z.object({ approvalId: id, courseId: id.optional(), action: plannerActionSchema }).strict(),
    response: z.object({ ok: z.literal(true), replayed: z.boolean() }).strict(),
  },
  "planner:quick-add": { request: taskInputSchema, response: taskSchema },
} as const;
