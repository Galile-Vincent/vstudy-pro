import { Card, Button } from "@astryxdesign/core";
import { ZodError } from "zod";
import { useState, type FormEvent } from "react";
import type { MoodleCourse } from "../../shared/moodle";
import { examInputSchema, taskInputSchema, type PlannerAction } from "../../shared/planner";
import { tr, i18n } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import { FormField } from "../components/ui";
import { Selector } from "@astryxdesign/core";
import type { PlannerApi } from "./planner-api";
export function PlannerForms({ courses, api, onSaved, onExam, onError }: {
  courses: MoodleCourse[]; api: PlannerApi; onSaved: () => Promise<void>; onExam: (action: PlannerAction) => void; onError: () => void;
}) {
  const [taskCourse, setTaskCourse] = useState("none");
  const [examCourse, setExamCourse] = useState("none");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true);
    try {
      await api.quickAdd(taskInputSchema.parse({ title: data.get("title"), courseId: (data.get("courseId") === "none" ? null : data.get("courseId")) || null,
        dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null, estimateMinutes: Number(data.get("estimate")) }));
      setErrors({});
      form.reset();
      setTaskCourse("none");
      await onSaved();
    } catch (error) {
      if (error instanceof ZodError) {
        setErrors(Object.fromEntries(error.issues.map(issue => [String(issue.path[0]), tr("planner:error")])));
      }
      onError();
    } finally { setBusy(false); }
  };
  const submitExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const exam = examInputSchema.parse({ title: data.get("title"), courseId: (data.get("courseId") === "none" ? null : data.get("courseId")) || null, date: new Date(String(data.get("date"))).toISOString(), scopeTopics: String(data.get("topics")).split("\n").map(t => t.trim()).filter(Boolean), materialIds: [] });
      onExam({ type: "create-exam", exam });
    } catch { onError(); }
  };
  const courseField = (value: string, onChange: (value: string) => void) => <Selector label={tr("planner:course")} htmlName="courseId" value={value} onChange={onChange} options={[{value:"none",label:tr("planner:no_course")},...courses.map(c=>({value:c.id,label:displayTitle(c.identity,i18n.resolvedLanguage||"en",c.fullName)}))]} />;
  return <div className="planner-forms">
    <Card elevation="none" className="p-6"><details open>
      <summary>{tr("planner:quick_add")}</summary>
      <form className="planner-form" onSubmit={e => void submitTask(e)}
        onInvalid={event => {
          const input = event.target as HTMLInputElement;
          setErrors(current => ({ ...current, [input.name === "estimate" ? "estimateMinutes" : input.name]: input.validationMessage }));
        }} onInput={event => {
          const input = event.target as HTMLInputElement;
          setErrors(current => ({ ...current, [input.name === "estimate" ? "estimateMinutes" : input.name]: "" }));
        }}>
        <FormField className="planner-wide" error={errors.title || undefined} label={tr("planner:task_title")}  children={field => <input {...field} name="title" required {...{maxLength: 200}} autoComplete="off" />} />
        {courseField(taskCourse, setTaskCourse)}
        <FormField error={errors.dueAt || undefined} label={tr("planner:due")}  children={field => <input {...field} type="datetime-local" name="dueAt" />} />
        <FormField error={errors.estimateMinutes || undefined} label={tr("planner:estimate")}  children={field => <input {...field} type="number" name="estimate" min={5} max={2880} step={5} defaultValue={30} required />} />
        <Button label={(tr("planner:quick_add"))} type="submit"  isDisabled={busy}>{tr("planner:quick_add")}</Button>
      </form>
    </details></Card>
    <Card elevation="none" className="p-6"><details>
      <summary>{tr("planner:add_exam")}</summary>
      <form className="planner-form" onSubmit={submitExam}>
        <FormField className="planner-wide" label={tr("planner:exam_title")} children={field => <input {...field} name="title" required {...{maxLength: 200}} />} />
        {courseField(examCourse, setExamCourse)}
        <FormField label={tr("planner:exam_date")} children={field => <input {...field} type="datetime-local" name="date" required />} />
        <FormField className="planner-wide" label={tr("planner:topics")} children={field => <textarea {...field} name="topics" rows={3} {...{maxLength: 8000}} />} />
        <Button label={(tr("planner:confirm"))} type="submit">{tr("planner:confirm")}</Button>
      </form>
    </details></Card>
  </div>;
}
