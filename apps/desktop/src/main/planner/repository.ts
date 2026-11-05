/** SQLite ownership for student plans. Approval rechecks live state and writes a complete plan in one savepoint. */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  taskSchema, examSchema, goalSchema, studyPlanSchema, studyBlockSchema, plannerReminderSchema,
  plannerActionSchema, taskInputSchema, type PlannerSnapshot, type PlannerAction,
} from "../../shared/planner";
import { assertPlannerAction, type PlanningContext } from "../../shared/planner-policy";
import { MoodleRepository } from "../moodle/repository";

export class PlannerRepository {
  constructor(private readonly db: DatabaseSync, private readonly clock: () => number = Date.now) {}
  snapshot(): PlannerSnapshot {
    return {
      tasks: this.db.prepare("SELECT * FROM planner_tasks ORDER BY dueAt,id").all().map(row => taskSchema.parse(row)),
      exams: this.db.prepare("SELECT * FROM planner_exams ORDER BY date,id").all().map(row => examSchema.parse({ ...row, scopeTopics: JSON.parse(String(row.scopeTopics)), materialIds: JSON.parse(String(row.materialIds)) })),
      goals: this.db.prepare("SELECT * FROM planner_goals ORDER BY id").all().map(row => goalSchema.parse(row)),
      plans: this.db.prepare("SELECT * FROM planner_plans ORDER BY createdAt,id").all().map(row => studyPlanSchema.parse({ ...row, assumptions: JSON.parse(String(row.assumptions)) })),
      blocks: this.db.prepare("SELECT * FROM planner_blocks ORDER BY startsAt,id").all().map(({ targetKind, targetId, ...row }) => studyBlockSchema.parse({ ...row, target: targetKind ? { kind: targetKind, id: targetId } : null })),
      reminders: this.db.prepare("SELECT * FROM planner_reminders ORDER BY remindAt,id").all().map(({ targetKind, targetId, fired, ...row }) => plannerReminderSchema.parse({ ...row, target: { kind: targetKind, id: targetId }, fired: fired === 1 })),
    };
  }
  context(courseId?: string): PlanningContext {
    const moodle = new MoodleRepository(this.db);
    const overview = moodle.overview();
    const documentIds = this.db.prepare(`SELECT DISTINCT f.documentId FROM moodle_files f JOIN documents d ON d.id=f.documentId
      WHERE d.status='ready' AND d.deletedAt IS NULL AND (? IS NULL OR f.courseId=?)`).all(courseId ?? null, courseId ?? null).map(row => z.string().parse(row.documentId));
    return { snapshot: this.snapshot(), deadlines: overview.courses.flatMap(c => moodle.course(c.id).deadlines), courseIds: overview.courses.map(c => c.id), documentIds, now: this.clock() };
  }
  quickAdd(input: z.input<typeof taskInputSchema>) {
    const task = taskInputSchema.parse(input);
    assertPlannerAction({ type: "create-task", task }, this.context());
    return this.insertTask(task, "user");
  }
  saveGoal(input: z.input<typeof goalSchema>) {
    const goal = goalSchema.parse(input);
    this.db.prepare("INSERT INTO planner_goals VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,courseId=excluded.courseId,targetDate=excluded.targetDate,status=excluded.status")
      .run(goal.id, goal.title, goal.courseId, goal.targetDate, goal.status);
    return goal;
  }
  approve(approvalId: string, candidate: PlannerAction, courseId?: string): { ok: true; replayed: boolean } {
    z.string().uuid().parse(approvalId);
    const action = plannerActionSchema.parse(candidate);
    const encoded = JSON.stringify({ courseId: courseId ?? null, action });
    this.db.exec("SAVEPOINT planner_approval");
    try {
      const previous = this.db.prepare("SELECT action FROM planner_approvals WHERE id=?").get(approvalId);
      if (previous) {
        if (previous.action !== encoded) throw new Error("Approval ID reused for a different action");
        this.db.exec("RELEASE planner_approval");
        return { ok: true, replayed: true };
      }
      const materialsCourse = courseId ?? (action.type === "create-exam" ? action.exam.courseId ?? undefined : undefined);
      const context = this.context(materialsCourse);
      assertPlannerAction(action, context, courseId);
      this.write(action);
      this.db.prepare("INSERT INTO planner_approvals VALUES (?,?,?)").run(approvalId, encoded, new Date(this.clock()).toISOString());
      this.db.exec("RELEASE planner_approval");
      return { ok: true, replayed: false };
    } catch (error) {
      this.db.exec("ROLLBACK TO planner_approval; RELEASE planner_approval");
      throw error;
    }
  }
  fired(id: string) { this.db.prepare("UPDATE planner_reminders SET fired=1 WHERE id=?").run(id); }
  private insertTask(task: z.infer<typeof taskInputSchema>, source: "user" | "agent") {
    const now = new Date(this.clock()).toISOString();
    const item = taskSchema.parse({ ...task, id: randomUUID(), status: "todo", source: task.deadlineId ? "moodle" : source, createdAt: now, updatedAt: now });
    this.db.prepare("INSERT INTO planner_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(item.id, item.title, item.courseId, item.dueAt, item.estimateMinutes, item.status, item.source, item.deadlineId, item.goalId, item.createdAt, item.updatedAt);
    return item;
  }
  private write(action: PlannerAction): void {
    switch (action.type) {
      case "create-task": this.insertTask(action.task, "agent"); return;
      case "update-task": {
        const task = this.snapshot().tasks.find(t => t.id === action.taskId)!;
        const item = taskSchema.parse({ ...task, ...action.changes, updatedAt: new Date(this.clock()).toISOString() });
        this.db.prepare("UPDATE planner_tasks SET title=?,courseId=?,dueAt=?,estimateMinutes=?,status=?,goalId=?,updatedAt=? WHERE id=?")
          .run(item.title, item.courseId, item.dueAt, item.estimateMinutes, item.status, item.goalId, item.updatedAt, item.id);
        return;
      }
      case "create-exam": {
        const item = action.exam;
        this.db.prepare("INSERT INTO planner_exams VALUES (?,?,?,?,?,?,?,?)")
          .run(randomUUID(), item.title, item.courseId, item.date, JSON.stringify(item.scopeTopics), JSON.stringify(item.materialIds), item.deadlineId, new Date(this.clock()).toISOString());
        return;
      }
      case "set-reminder":
        this.db.prepare("INSERT INTO planner_reminders VALUES (?,?,?,?,?,0)").run(randomUUID(), action.target.kind, action.target.id, action.remindAt, action.note);
        return;
      case "summarize-course-materials":
      case "generate-practice-quiz": return;
    }
    const planId = action.type === "schedule-study-block" ? null : randomUUID();
    if (action.type !== "schedule-study-block") this.db.prepare("INSERT INTO planner_plans VALUES (?,?,?,?,?,?)")
      .run(planId, action.title, action.timeZone, action.dailyBudgetMinutes, JSON.stringify(action.assumptions), new Date(this.clock()).toISOString());
    const insert = this.db.prepare("INSERT INTO planner_blocks VALUES (?,?,?,?,?,?,?,?)");
    for (const b of action.type === "schedule-study-block" ? [action.block] : action.blocks)
      insert.run(randomUUID(), planId, b.title, b.courseId, b.target?.kind ?? null, b.target?.id ?? null, b.startsAt, b.durationMinutes);
  }
}
