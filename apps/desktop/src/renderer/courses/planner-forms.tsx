/** Direct student input stays separate from model proposals. Exam input creates a reviewable proposal. */
import { useState, type FormEvent } from "react";
import type { MoodleCourse } from "../../shared/moodle";
import { examInputSchema, taskInputSchema, type PlannerAction } from "../../shared/planner";
import { tr, i18n } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { PlannerApi } from "./planner-api";
export function PlannerForms({ courses, api, onSaved, onExam, onError }: {
  courses: MoodleCourse[]; api: PlannerApi; onSaved: () => Promise<void>; onExam: (action: PlannerAction) => void; onError: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true);
    try {
      await api.quickAdd(taskInputSchema.parse({ title: data.get("title"), courseId: data.get("courseId") || null,
        dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null, estimateMinutes: Number(data.get("estimate")) }));
      form.reset();
      await onSaved();
    } catch { onError(); } finally { setBusy(false); }
  };
  const submitExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const exam = examInputSchema.parse({ title: data.get("title"), courseId: data.get("courseId") || null, date: new Date(String(data.get("date"))).toISOString(), scopeTopics: String(data.get("topics")).split("\n").map(t => t.trim()).filter(Boolean), materialIds: [] });
      onExam({ type: "create-exam", exam });
    } catch { onError(); }
  };
  const courseOptions = <><option value="">{tr("planner:no_course")}</option>{courses.map(c => <option key={c.id} value={c.id}>{displayTitle(c.identity, i18n.resolvedLanguage || "en", c.fullName)}</option>)}</>;
  return <div className="planner-forms">
    <details className="planner-panel" open>
      <summary>{tr("planner:quick_add")}</summary>
      <form className="planner-form" onSubmit={e => void submitTask(e)}>
        <label className="planner-wide">{tr("planner:task_title")}<Input name="title" required maxLength={200} autoComplete="off" /></label>
        <label>{tr("planner:course")}<select name="courseId">{courseOptions}</select></label>
        <label>{tr("planner:due")}<Input type="datetime-local" name="dueAt" /></label>
        <label>{tr("planner:estimate")}<Input type="number" name="estimate" min={5} max={2880} step={5} defaultValue={30} required /></label>
        <Button type="submit" disabled={busy}>{tr("planner:quick_add")}</Button>
      </form>
    </details>
    <details className="planner-panel">
      <summary>{tr("planner:add_exam")}</summary>
      <form className="planner-form" onSubmit={submitExam}>
        <label className="planner-wide">{tr("planner:exam_title")}<Input name="title" required maxLength={200} /></label>
        <label>{tr("planner:course")}<select name="courseId">{courseOptions}</select></label>
        <label>{tr("planner:exam_date")}<Input type="datetime-local" name="date" required /></label>
        <label className="planner-wide">{tr("planner:topics")}<textarea name="topics" rows={3} maxLength={8000} /></label>
        <Button type="submit">{tr("planner:confirm")}</Button>
      </form>
    </details>
  </div>;
}
