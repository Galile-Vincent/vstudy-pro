/** Confirmation cards disclose complete proposed writes and material-provider access before approval. */
import type { MoodleAgentAction, MoodleCourse, MoodleDeadline, MoodleFile } from "../../shared/moodle";
import type { PlannerSnapshot } from "../../shared/planner";
import { i18n, tr } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import { Button, Card, ListRow } from "../components/ui";
export function plannerDate(value: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function PlannerProposal({ action, snapshot, courses, deadlines, files = [], busy, onApprove, onDismiss, headingLevel = 3 }: {
  action: MoodleAgentAction; snapshot: PlannerSnapshot; courses: MoodleCourse[]; deadlines: MoodleDeadline[]; files?: MoodleFile[];
  headingLevel?: 2 | 3; busy: boolean; onApprove: () => void; onDismiss: () => void;
}) {
  const course = (id: string | null) => {
    const c = courses.find(c => c.id === id);
    return c ? displayTitle(c.identity, i18n.resolvedLanguage || "en", c.fullName) : tr("planner:no_course");
  };
  const targetTitle = (kind: string, id: string) => (kind === "task" ? snapshot.tasks : kind === "exam" ? snapshot.exams : deadlines).find(item => item.id === id)?.title ?? tr("planner:unknown_item");
  const documentName = (id: string) => files.find(f => f.documentId === id)?.name ?? tr("planner:unknown_item");
  const isMaterials = action.type === "summarize-course-materials" || action.type === "generate-practice-quiz";
  const blocks = action.type === "make-study-plan" || action.type === "plan-today" ? action.blocks : action.type === "schedule-study-block" ? [action.block] : [];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const Subheading = headingLevel === 2 ? "h3" : "h4";
  return <Card variant="flat" role="article" className="planner-proposal moodle-proposal p-6" aria-label={tr("planner:confirm")}>
    <p className="moodle-eyebrow">{tr(action.type === "create-reminder" || action.type === "export-calendar" ? "moodle:confirm_action" : "planner:confirm")}</p>
    <Heading>{tr(`planner:action_${action.type}`)}</Heading>
    {action.type === "create-task" && <>
      <strong>{action.task.title}</strong><p>{course(action.task.courseId)}</p>
      <p>{action.task.dueAt ? plannerDate(action.task.dueAt) : tr("planner:no_due")} · {tr("planner:minutes", { minutes: action.task.estimateMinutes })}</p>
    </>}
    {action.type === "update-task" && <>
      <strong>{targetTitle("task", action.taskId)}</strong>
      <dl className="planner-changes">
        {action.changes.title !== undefined && <><dt>{tr("planner:title_field")}</dt><dd>{action.changes.title}</dd></>}
        {action.changes.status !== undefined && <><dt>{tr("planner:status_field")}</dt><dd>{tr(`planner:status_${action.changes.status}`)}</dd></>}
        {action.changes.dueAt !== undefined && <><dt>{tr("planner:due")}</dt><dd>{action.changes.dueAt ? plannerDate(action.changes.dueAt) : tr("planner:no_due")}</dd></>}
        {action.changes.estimateMinutes !== undefined && <><dt>{tr("planner:estimate")}</dt><dd>{tr("planner:minutes", { minutes: action.changes.estimateMinutes })}</dd></>}
        {action.changes.courseId !== undefined && <><dt>{tr("planner:course")}</dt><dd>{course(action.changes.courseId)}</dd></>}
        {action.changes.goalId !== undefined && <><dt>{tr("planner:updated_fields")}</dt><dd>{snapshot.goals.find(g => g.id === action.changes.goalId)?.title ?? tr("planner:unknown_item")}</dd></>}
      </dl>
    </>}
    {action.type === "create-exam" && <>
      <strong>{action.exam.title}</strong><p>{course(action.exam.courseId)} · {plannerDate(action.exam.date)}</p>
      {action.exam.scopeTopics.length ? <ul>{action.exam.scopeTopics.map((topic, index) => <li key={index}>{topic}</li>)}</ul> : <p>{tr("planner:scope_unknown")}</p>}
      <ul>{action.exam.materialIds.map(id => <li key={id}>{documentName(id)}</li>)}</ul>
    </>}
    {(action.type === "make-study-plan" || action.type === "plan-today") && <>
      <strong>{action.title}</strong><Subheading>{tr("planner:assumptions")}</Subheading>
      <ul>{action.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul>
    </>}
    {(action.type === "make-study-plan" || action.type === "plan-today" || action.type === "schedule-study-block") && <p>{tr("planner:capacity", { minutes: action.dailyBudgetMinutes, zone: action.timeZone })}</p>}
    {blocks.length > 0 && <ol className="planner-proposed-blocks">{blocks.map((block, i) => <li key={i}>
      <ListRow title={block.title} subtitle={course(block.courseId)} meta={<time dateTime={block.startsAt}>{tr("planner:duration_window", { start: plannerDate(block.startsAt, "timeZone" in action ? action.timeZone : undefined), minutes: block.durationMinutes })}</time>} />
    </li>)}</ol>}
    {(action.type === "create-reminder" || action.type === "set-reminder") && <>
      <strong>{action.type === "create-reminder" ? targetTitle("deadline", action.deadlineId) : targetTitle(action.target.kind, action.target.id)}</strong>
      <p>{plannerDate(action.remindAt)}</p><p>{action.note}</p>
    </>}
    {action.type === "export-calendar" && <ul>
      {(action.deadlineIds ?? []).map(id => <li key={id}>{targetTitle("deadline", id)} · {deadlines.find(d => d.id === id)?.dueAt ? plannerDate(deadlines.find(d => d.id === id)!.dueAt) : tr("planner:unknown_item")}</li>)}
      {(action.taskIds ?? []).map(id => <li key={id}>{targetTitle("task", id)}</li>)}
      {(action.examIds ?? []).map(id => <li key={id}>{targetTitle("exam", id)}</li>)}
      {(action.blockIds ?? []).map(id => <li key={id}>{snapshot.blocks.find(b => b.id === id)?.title ?? tr("planner:unknown_item")}</li>)}
    </ul>}
    {isMaterials && <>
      <p>{tr("planner:material_permission")}</p>
      <ul>{action.documentIds.map(id => <li key={id}>{documentName(id)}</li>)}</ul>
    </>}
    <p className="planner-muted">{tr("planner:approval_notice")}</p>
    <div className="planner-actions">
      <Button disabled={busy} onClick={onApprove}>{action.type === "create-reminder" || action.type === "export-calendar" ? tr("moodle:approve") : tr(isMaterials ? "planner:approve_materials" : "planner:approve")}</Button>
      <Button disabled={busy} variant="ghost" onClick={onDismiss}>{tr("moodle:dismiss")}</Button>
    </div>
  </Card>;
}
