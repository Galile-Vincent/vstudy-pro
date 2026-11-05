/**
 * Provide reusable synthetic inputs for subsystem regression tests.
 * Owned by main/planner.
 * Fixture values are test data and must never contain real credentials.
 * @packageDocumentation
 */
/** Deterministic student data shared by planner verification and recorded evaluations. */
import type { Store } from "../../db";
import { MoodleRepository } from "../../moodle/repository";
import type { MoodleCourseDetail } from "../../../shared/moodle";
import { emptyPlanner, type PlannerTask } from "../../../shared/planner";
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const now = Date.parse("2030-01-01T09:00:00Z");
export function studentDetail(): MoodleCourseDetail {
  return {
    course: { id: id(1), accountId: id(2), remoteId: 1, fullName: "Physics", shortName: "PHY", imageUrl: null, progress: null, startAt: null, endAt: null, favourite: false,
      identity: { title: { zh: null, en: "Physics" }, teachers: [], code: null, term: null, classLabel: { zh: null, en: null }, lifecycle: "current", lifecycleSource: "dates", hidden: false, hasProgress: false, format: null, summaryHtml: null } },
    deadlines: [{ id: id(3), courseId: id(1), title: "Lab report", dueAt: "2030-01-03T15:00:00Z", kind: "assignment", url: null, submitted: false }],
    notifications: [], announcements: [], sections: [], files: [], grades: [], reminders: [],
  };
}
export function seedStudent(store: Store) {
  const moodle = new MoodleRepository(store.db), detail = studentDetail();
  moodle.saveAccount({ id: id(2), siteUrl: "https://school.example", siteName: "School", remoteUserId: 1, displayName: "Student", syncedAt: null, status: "connected" });
  moodle.apply(id(2), { courses: [detail.course], deadlines: detail.deadlines, notifications: [], grades: [], files: [] });
  return { moodle, detail };
}
export function task(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return { id: id(4), title: "Write report", courseId: id(1), dueAt: "2030-01-03T15:00:00Z", estimateMinutes: 60, status: "todo", source: "user", deadlineId: id(3), goalId: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...overrides };
}
export const studentContext = () => ({ snapshot: emptyPlanner(), deadlines: studentDetail().deadlines, courseIds: [id(1)], documentIds: [], now });
