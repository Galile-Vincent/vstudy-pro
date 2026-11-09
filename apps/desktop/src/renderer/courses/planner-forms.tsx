/** Direct student input stays separate from model proposals. Exam input creates a reviewable proposal. */
import { useState, type FormEvent } from "react";
import type { MoodleCourse } from "../../shared/moodle";
import { examInputSchema, taskInputSchema, type PlannerAction } from "../../shared/planner";
import { tr, i18n } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import { Button } from "../components/ui/button";
import { Input, FormField, Card } from "../components/ui";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
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
      await api.quickAdd(taskInputSchema.parse({ title: data.get("title"), courseId: (data.get("courseId") === "none" ? null : data.get("courseId")) || null,
        dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null, estimateMinutes: Number(data.get("estimate")) }));
      form.reset();
      await onSaved();
    } catch { onError(); } finally { setBusy(false); }
  };
  const submitExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const exam = examInputSchema.parse({ title: data.get("title"), courseId: (data.get("courseId") === "none" ? null : data.get("courseId")) || null, date: new Date(String(data.get("date"))).toISOString(), scopeTopics: String(data.get("topics")).split("\n").map(t => t.trim()).filter(Boolean), materialIds: [] });
      onExam({ type: "create-exam", exam });
    } catch { onError(); }
  };
  const courseField = <FormField label={tr("planner:course")} children={field =>
    <Select name="courseId" defaultValue="none">
      <SelectTrigger {...field}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{tr("planner:no_course")}</SelectItem>
        {courses.map(c => <SelectItem key={c.id} value={c.id}>
          {displayTitle(c.identity, i18n.resolvedLanguage || "en", c.fullName)}
        </SelectItem>)}
      </SelectContent>
    </Select>
  } />;
  return <div className="planner-forms">
    <Card variant="flat" className="p-6"><details open>
      <summary>{tr("planner:quick_add")}</summary>
      <form className="planner-form" onSubmit={e => void submitTask(e)}>
        <FormField className="planner-wide" label={tr("planner:task_title")} children={field => <Input {...field} name="title" required maxLength={200} autoComplete="off" />} />
        {courseField}
        <FormField label={tr("planner:due")} children={field => <Input {...field} type="datetime-local" name="dueAt" />} />
        <FormField label={tr("planner:estimate")} children={field => <Input {...field} type="number" name="estimate" min={5} max={2880} step={5} defaultValue={30} required />} />
        <Button type="submit" disabled={busy}>{tr("planner:quick_add")}</Button>
      </form>
    </details></Card>
    <Card variant="flat" className="p-6"><details>
      <summary>{tr("planner:add_exam")}</summary>
      <form className="planner-form" onSubmit={submitExam}>
        <FormField className="planner-wide" label={tr("planner:exam_title")} children={field => <Input {...field} name="title" required maxLength={200} />} />
        {courseField}
        <FormField label={tr("planner:exam_date")} children={field => <Input {...field} type="datetime-local" name="date" required />} />
        <FormField className="planner-wide" label={tr("planner:topics")} children={field => <Textarea {...field} name="topics" rows={3} maxLength={8000} />} />
        <Button type="submit">{tr("planner:confirm")}</Button>
      </form>
    </details></Card>
  </div>;
}
