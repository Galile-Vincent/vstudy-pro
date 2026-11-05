/** Course proposals may only reference the current course, even when global workload is provided for conflict checks. */
import type { MoodleAgentAction, MoodleCourseDetail } from "./moodle";
import { assertPlannerAction, type PlanningContext } from "./planner-policy";
export function assertCourseAction(action: MoodleAgentAction, detail: MoodleCourseDetail, context: PlanningContext) {
  if (action.type === "create-reminder") {
    const due = detail.deadlines.find(d => d.id === action.deadlineId && !d.submitted && !d.orphaned);
    if (!due || Date.parse(action.remindAt) <= context.now || Date.parse(action.remindAt) >= Date.parse(due.dueAt)) throw new Error("Invalid course reminder");
    return;
  }
  if (action.type === "export-calendar") {
    const refs = [
      ...(action.deadlineIds ?? []).map(id => detail.deadlines.find(d => d.id === id)),
      ...(action.taskIds ?? []).map(id => context.snapshot.tasks.find(t => t.id === id && t.courseId === detail.course.id && t.dueAt)),
      ...(action.examIds ?? []).map(id => context.snapshot.exams.find(e => e.id === id && e.courseId === detail.course.id)),
      ...(action.blockIds ?? []).map(id => context.snapshot.blocks.find(b => b.id === id && b.courseId === detail.course.id)),
    ];
    if (!refs.length || refs.length > 56 || refs.some(ref => !ref)) throw new Error("Invalid calendar scope");
    return;
  }
  assertPlannerAction(action, context, detail.course.id);
}
