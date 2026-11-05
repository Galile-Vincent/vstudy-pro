/**
 * Regression coverage for planner repository.
 * Owned by main/planner.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../db";
import { migrations } from "../db/migrations";
import { PlannerRepository } from "./repository";
import { id, now, seedStudent } from "./__fixtures__/student";
import { emptyPlanner, type PlannerAction } from "../../shared/planner";
import { plannerCalendar } from "./calendar";
import { firePlannerReminders } from "./reminders";
const stores: ReturnType<typeof openStore>[] = [];
const dirs: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function setup() {
  const store = openStore(":memory:"); stores.push(store);
  const { moodle, detail } = seedStudent(store);
  return { store, moodle, detail, repo: new PlannerRepository(store.db, () => now) };
}
const input = { title: "Write report", courseId: id(1), dueAt: "2030-01-03T15:00:00Z", estimateMinutes: 60, deadlineId: id(3), goalId: null };
const block = { title: "Draft report", courseId: id(1), target: { kind: "deadline" as const, id: id(3) }, startsAt: "2030-01-01T10:00:00Z", durationMinutes: 30 };
it("requires approval and retries an approval without duplicating work", () => {
  const { repo } = setup();
  const action = { type: "create-task" as const, task: input };
  expect(repo.snapshot()).toEqual(emptyPlanner());
  const approval = randomUUID();
  expect(repo.approve(approval, action, id(1))).toEqual({ ok: true, replayed: false });
  expect(repo.approve(approval, action, id(1))).toEqual({ ok: true, replayed: true });
  expect(repo.snapshot().tasks).toHaveLength(1);
  expect(repo.snapshot().tasks[0]).toMatchObject({ title: "Write report", source: "moodle" });
  expect(() => repo.approve(approval, { ...action, task: { ...input, title: "Different" } })).toThrow("reused");
});
it("saves goals, exams, tasks, and blocks and preserves student work when sync removes a course", () => {
  const { repo, moodle, store } = setup();
  repo.saveGoal({ id: id(8), courseId: id(1), title: "Pass physics", targetDate: null, status: "active" });
  const task = repo.quickAdd({ ...input, goalId: id(8) });
  repo.approve(randomUUID(), { type: "create-exam", exam: { title: "Final", courseId: id(1), date: "2030-01-04T10:00:00Z", scopeTopics: ["Waves"], materialIds: [], deadlineId: null } });
  repo.approve(randomUUID(), { type: "schedule-study-block", block, timeZone: "UTC", dailyBudgetMinutes: 60 });
  repo.approve(randomUUID(), { type: "update-task", taskId: task.id, changes: { status: "doing" } });
  moodle.disconnect(id(2));
  expect(repo.snapshot().tasks[0]).toMatchObject({ courseId: null, deadlineId: null, status: "doing" });
  expect(repo.snapshot().exams[0]).toMatchObject({ courseId: null, scopeTopics: ["Waves"] });
  expect(repo.snapshot().blocks[0]?.courseId).toBeNull();
  expect(store.integrityCheck()).toEqual([{ integrity_check: "ok" }]);
});
it("rolls back a plan on conflicts and rechecks a proposal after another approval", () => {
  const { repo } = setup();
  const action: PlannerAction = { type: "make-study-plan", title: "Week", timeZone: "UTC", dailyBudgetMinutes: 60, assumptions: ["An hour is available"], blocks: [block, { ...block, startsAt: "2030-01-01T10:15:00Z" }] };
  expect(() => repo.approve(randomUUID(), action)).toThrow("overlap");
  expect(repo.snapshot().plans).toHaveLength(0);
  expect(repo.snapshot().blocks).toHaveLength(0);
  repo.approve(randomUUID(), { ...action, blocks: [block] });
  expect(() => repo.approve(randomUUID(), { ...action, blocks: [block] })).toThrow("overlap");
  expect(repo.snapshot().plans).toHaveLength(1);
});
it("rejects foreign course actions, late blocks, unavailable documents and daily overbooking", () => {
  const { repo } = setup();
  expect(() => repo.approve(randomUUID(), { type: "create-task", task: input }, id(99))).toThrow("scope");
  expect(() => repo.approve(randomUUID(), { type: "generate-practice-quiz", documentIds: [id(99)] }, id(1))).toThrow("ready");
  const schedule = { type: "schedule-study-block" as const, timeZone: "UTC", dailyBudgetMinutes: 60, block };
  expect(() => repo.approve(randomUUID(), { ...schedule, block: { ...block, startsAt: "2030-01-03T15:00:00Z" } })).toThrow("due");
  repo.approve(randomUUID(), schedule);
  expect(() => repo.approve(randomUUID(), { ...schedule, block: { ...block, startsAt: "2030-01-01T11:00:00Z", durationMinutes: 45 } })).toThrow("budget");
});
it("fires an approved task reminder once and exports blocks with duration and escaped titles", () => {
  const { repo } = setup();
  const task = repo.quickAdd(input);
  repo.approve(randomUUID(), { type: "set-reminder", target: { kind: "task", id: task.id }, remindAt: "2030-01-01T09:30:00Z", note: "Begin" });
  const later = new PlannerRepository(stores.at(-1)!.db, () => now + 3600000);
  const fired: string[] = [];
  firePlannerReminders(later, title => { fired.push(title); return true; });
  firePlannerReminders(later, title => { fired.push(title); return true; });
  expect(fired).toEqual(["Write report"]);
  repo.approve(randomUUID(), { type: "schedule-study-block", timeZone: "UTC", dailyBudgetMinutes: 60, block: { ...block, title: "Read, then\nrecall" } });
  const snapshot = repo.snapshot(), text = plannerCalendar(snapshot, [], { blockIds: [snapshot.blocks[0]!.id] });
  expect(text).toContain("DTEND:20300101T103000Z");
  expect(text).toContain("SUMMARY:Read\\, then\\nrecall");
});
it("backs up v20 with private permissions and persists planner data after reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "vstudy-planner-")); dirs.push(dir);
  const path = join(dir, "db.sqlite"), db = new DatabaseSync(path);
  db.exec("CREATE TABLE migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL)");
  for (const m of migrations.filter(m => m.version <= 20)) {
    db.exec(m.sql); db.prepare("INSERT INTO migrations VALUES (?,?)").run(m.version, "2030-01-01");
  }
  db.prepare("INSERT INTO settings VALUES (?,?)").run("sentinel", JSON.stringify("課業 日本語"));
  db.close();
  const store = openStore(path);
  expect(statSync(path + ".before-v21.bak").mode & 0o777).toBe(0o600);
  const backup = new DatabaseSync(path + ".before-v21.bak");
  expect(backup.prepare("SELECT value FROM settings WHERE key='sentinel'").get()?.value).toBe(JSON.stringify("課業 日本語"));
  expect(backup.prepare("SELECT name FROM sqlite_master WHERE name='planner_tasks'").get()).toBeUndefined();
  backup.close();
  new PlannerRepository(store.db).quickAdd({ ...input, courseId: null, deadlineId: null });
  store.close();
  const reopened = openStore(path); stores.push(reopened);
  expect(new PlannerRepository(reopened.db).snapshot().tasks[0]?.title).toBe("Write report");
  expect(reopened.integrityCheck()).toEqual([{ integrity_check: "ok" }]);
});

it('skips a corrupt planner row while preserving healthy tasks and reminders',()=>{
  const {repo,store}=setup();
  const task=repo.quickAdd(input);
  store.db.prepare('INSERT INTO planner_goals VALUES (?,?,?,?,?)').run(id(90),'',null,null,'active');
  expect(repo.snapshot().tasks).toEqual([task]);
  expect(repo.snapshot().goals).toEqual([]);
  expect(()=>firePlannerReminders(repo,()=>true)).not.toThrow();
});
