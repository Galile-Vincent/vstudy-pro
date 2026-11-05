import { describe, expect, it } from "vitest";
import recorded from "./__fixtures__/expected.json";
import { id, now, studentContext, studentDetail, task } from "./__fixtures__/student";
import { draftStudyPlan } from "../../shared/planner-draft";
import { assertPlannerAction, localDay } from "../../shared/planner-policy";
import { plannerActionSchema } from "../../shared/planner";
import { parseCourseActions } from "../prompt/course";
function scenario(name: string) {
  const context = studentContext();
  let days = 2;
  if (name === "heavy week") context.snapshot.tasks.push(task({ estimateMinutes: 600 }));
  if (name === "exam in three days") {
    context.deadlines = []; days = 3;
    context.snapshot.exams.push({ id: id(5), title: "Physics exam", courseId: id(1), date: "2030-01-04T09:00:00Z", scopeTopics: ["Waves", "Optics", "Heat"], materialIds: [], deadlineId: null, createdAt: new Date(now).toISOString() });
  }
  if (name === "missing submissions") {
    days = 1;
    context.deadlines.push({ ...context.deadlines[0]!, id: id(6), title: "Missing submission", dueAt: "2030-01-01T08:00:00Z", submitted: null }, { ...context.deadlines[0]!, id: id(7), title: "Already submitted", submitted: true });
  }
  return { context, days };
}
class RecordedModel {
  constructor(private readonly action: unknown) {}
  async *stream() { yield "Review this draft before saving.\n```vstudy-action\n" + JSON.stringify(this.action) + "\n```"; }
}
describe("student planning evaluations with a recorded model", () => {
  it.each(recorded)("$name matches the recorded proposal and respects all constraints", async fixture => {
    const { context, days } = scenario(fixture.name);
    const draft = draftStudyPlan(context, { title: "Study draft", timeZone: "UTC", dailyBudgetMinutes: 60, startHour: 10, endHour: 12, days, assumptions: fixture.action.assumptions });
    expect(draft).toEqual({ action: fixture.action, unallocated: fixture.unallocated });
    let reply = "";
    for await (const chunk of new RecordedModel(fixture.action).stream()) reply += chunk;
    const detail = { ...studentDetail(), deadlines: context.deadlines };
    const proposals = parseCourseActions(reply, detail, now, context.snapshot).actions;
    expect(proposals).toHaveLength(1);
    const action = plannerActionSchema.parse(proposals[0]);
    expect(() => assertPlannerAction(action, context, id(1))).not.toThrow();
    if (action.type !== "make-study-plan" && action.type !== "plan-today") throw new Error("Expected a plan");
    const minutes = new Map<string, number>();
    for (const b of action.blocks) minutes.set(localDay(b.startsAt, "UTC"), (minutes.get(localDay(b.startsAt, "UTC")) ?? 0) + b.durationMinutes);
    expect([...minutes.values()].every(value => value <= 60)).toBe(true);
  });
  it("rejects recorded-model output that overbooks or misses a deadline", () => {
    const context = studentContext(), fixture = recorded[0]!.action;
    const block = { ...fixture.blocks[0]!, target: { kind: "deadline", id: id(3) } };
    for (const blocks of [[block, block], [{ ...block, startsAt: "2030-01-03T15:00:00Z" }]]) {
      const reply = "```vstudy-action\n" + JSON.stringify({ ...fixture, blocks }) + "\n```";
      expect(parseCourseActions(reply, studentDetail(), now, context.snapshot).actions).toEqual([]);
    }
  });
});
