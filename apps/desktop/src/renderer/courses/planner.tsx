import { IconButton } from "@astryxdesign/core";
import { TabList, Tab } from "@astryxdesign/core";
import { Card, Button } from "@astryxdesign/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, Sparkles } from "lucide-react";
import type { MoodleCourse, MoodleDeadline } from "../../shared/moodle";
import { emptyPlanner, type PlannerAction } from "../../shared/planner";
import { draftStudyPlan } from "../../shared/planner-draft";
import { localDay, plannerTaskDone } from "../../shared/planner-policy";
import { i18n, tr } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import { plannerApi, type PlannerApi } from "./planner-api";
import { PlannerProposal, plannerDate } from "./planner-proposal";
import { PlannerForms } from "./planner-forms";
import { FormField, PageHeader, Section, ListRow } from "../components/ui";
import "./planner.css";
import { SurfaceErrorBoundary } from "../components/surface-error-boundary";
type PlannerProps = {
  courses: MoodleCourse[]; deadlines: MoodleDeadline[]; api?: PlannerApi; clock?: () => number;
};
export function Planner(props: PlannerProps) {
  return <SurfaceErrorBoundary><PlannerContent {...props}/></SurfaceErrorBoundary>;
}
function PlannerContent({ courses, deadlines, api = plannerApi, clock = Date.now }: PlannerProps) {
  useTranslation("planner");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [snapshot, setSnapshot] = useState(emptyPlanner);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState("today");
  const [notice, setNotice] = useState("");
  const [budget, setBudget] = useState(120);
  const [startHour, setStartHour] = useState(18), [endHour, setEndHour] = useState(22);
  const [pending, setPending] = useState<{ id: string; action: PlannerAction }>();
  const [unallocated, setUnallocated] = useState<ReturnType<typeof draftStudyPlan>["unallocated"]>([]);
  const [busy, setBusy] = useState(false);
  const approving = useRef(false);
  const [now, setNow] = useState(clock);
  const refresh = useCallback(async () => { setSnapshot(await api.snapshot()); setState("ready"); setNow(clock()); }, [api, clock]);
  useEffect(() => {
    let live = true;
    void api.snapshot().then(value => { if (live) { setSnapshot(value); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    const timer = setInterval(() => setNow(clock()), 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [api, clock]);
  const today = localDay(now, zone);
  const dayKeys = Array.from({ length: 8 }, (_, index) => localDay(now + index * 86400000, zone)).filter((day, index, all) => all.indexOf(day) === index).slice(0, 7);
  const tasks = snapshot.tasks.filter(t => !plannerTaskDone(t, deadlines) && (view === "week" || !t.dueAt || localDay(t.dueAt, zone) <= today || snapshot.blocks.some(b => b.target?.kind === "task" && b.target.id === t.id && localDay(b.startsAt, zone) === today)));
  const sourceDeadlines = deadlines.filter(d => !d.submitted && !d.orphaned && !snapshot.tasks.some(t => t.deadlineId === d.id) && localDay(d.dueAt, zone) <= (view === "today" ? today : dayKeys.at(-1)!));
  const exams = snapshot.exams.filter(e => Date.parse(e.date) >= now).sort((a, b) => a.date.localeCompare(b.date));
  const courseTitle = (id: string | null) => { const c = courses.find(c => c.id === id); return c ? displayTitle(c.identity, i18n.resolvedLanguage || "en", c.fullName) : tr("planner:no_course"); };
  const fail = () => setNotice(tr("planner:error"));
  const saved = async () => { await refresh(); setNotice(tr("planner:saved")); };
  const propose = (action: PlannerAction) => { setPending({ id: crypto.randomUUID(), action }); setNotice(""); };
  const draft = (days: number) => {
    const draft = draftStudyPlan({ snapshot, deadlines, courseIds: courses.map(c => c.id), documentIds: [], now: clock() }, {
      timeZone: zone, dailyBudgetMinutes: budget, startHour, endHour, days, title: tr(days === 1 ? "planner:plan_today" : "planner:plan_week"),
      assumptions: [tr("planner:assumed_window", { start: startHour, end: endHour, zone }), tr("planner:assumed_estimates")],
    });
    setUnallocated(draft.unallocated);
    if (draft.action) propose(draft.action);
    else { setPending(undefined); setNotice(tr("planner:nothing_to_plan")); }
  };
  const approve = async () => {
    if (!pending || approving.current) return;
    approving.current = true; setBusy(true);
    try { await api.approve(pending.id, pending.action); setPending(undefined); await saved(); }
    catch { fail(); } finally { approving.current = false; setBusy(false); }
  };
  const exportWeek = async () => {
    try { await api.exportCalendar({ blockIds: snapshot.blocks.filter(b => dayKeys.includes(localDay(b.startsAt, zone))).map(b => b.id).slice(0, 56) }); }
    catch { fail(); }
  };
  const validWindow = Number.isInteger(budget) && budget >= 15 && budget <= 480 && Number.isInteger(startHour) && Number.isInteger(endHour) && startHour >= 0 && endHour <= 24 && startHour < endHour;
  return <section className="planner" aria-label={tr("planner:title")} data-testid="student-planner">
    <PageHeader title={tr("planner:title")} description={tr("planner:intro")} actions={<>
      <Button label={(tr("planner:retry"))} variant="ghost" onClick={() => void refresh().catch(() => setState("error"))}>{tr("planner:retry")}</Button>
    </>} />
    {state === "loading" && <p role="status">{tr("planner:loading")}</p>}
    {state === "error" && <p role="alert">{tr("planner:planner_unavailable")}</p>}
    <p role="status" className="planner-notice">{notice}</p>
    {state === "ready" && <>
      <PlannerForms courses={courses} api={api} onSaved={saved} onExam={propose} onError={fail} />
      <section className=" planner-draft-controls" aria-label={tr("planner:plan_week")}><Card elevation="none" className="p-6">
        <div className="planner-capacity">
          <FormField label={tr("planner:daily_budget")} children={field => <input {...field} type="number" min={15} max={480} step={15} value={budget} onChange={e => setBudget(Number(e.target.value))} />} />
          <FormField label={tr("planner:start_hour")} children={field => <input {...field} type="number" min={0} max={23} value={startHour} onChange={e => setStartHour(Number(e.target.value))} />} />
          <FormField label={tr("planner:end_hour")} children={field => <input {...field} type="number" min={1} max={24} value={endHour} onChange={e => setEndHour(Number(e.target.value))} />} />
        </div>
        <p>{tr("planner:assumed_window", { start: startHour, end: endHour, zone })}</p>
        <div className="planner-actions">
          <Button icon={<Sparkles />} label={(tr("planner:plan_week"))}  isDisabled={busy || !validWindow} onClick={() => draft(7)}>{tr("planner:plan_week")}</Button>
          <Button label={(tr("planner:plan_today"))} variant="ghost"  isDisabled={busy || !validWindow} onClick={() => draft(1)}>{tr("planner:plan_today")}</Button>
          <Button icon={<CalendarDays />} label={(tr("planner:export_week"))} variant="ghost"  isDisabled={!snapshot.blocks.some(b => dayKeys.includes(localDay(b.startsAt, zone)))} onClick={() => void exportWeek()}>{tr("planner:export_week")}</Button>
        </div>
        <p className="planner-muted">{tr("planner:approval_notice")}</p>
      </Card></section>
      {unallocated.length > 0 && <Section aria-label={tr("planner:unallocated")} title={tr("planner:unallocated")}><ul>{unallocated.map((item, index) => <li key={index}>{tr(`planner:unallocated_${item.reason}`, { title: item.title, minutes: item.minutes })}</li>)}</ul></Section>}
      {pending && <PlannerProposal headingLevel={2} action={pending.action} courses={courses} deadlines={deadlines} snapshot={snapshot} busy={busy} onApprove={() => void approve()} onDismiss={() => setPending(undefined)} />}
      <div className="planner-view-tabs"><TabList role="tablist" value={view} onChange={setView} aria-label={tr("planner:title")}><Tab value="today" onFocus={() => setView("today")} label={tr("planner:today")} id={`tab-view-${"today"}`} panelId={`panel-view-${"today"}`} /><Tab value="week" onFocus={() => setView("week")} label={tr("planner:week")} id={`tab-view-${"week"}`} panelId={`panel-view-${"week"}`} /></TabList>{['today','week'].map(panel => <section role="tabpanel" id={`panel-view-${panel}`} aria-labelledby={`tab-view-${panel}`} hidden={view !== panel}>{view === panel && <>{view === panel && <div className="planner-columns"><div>
        <Section title={tr(view === "today" ? "planner:today" : "planner:week")}>
          {!tasks.length && <p className="planner-muted">{tr("planner:empty_today")}</p>}
          <ul className="planner-task-list">{tasks.map(task => <li key={task.id}><ListRow title={task.title} actions={
            <IconButton label={tr("planner:complete", { title: task.title })}  size="md" variant="ghost"  isDisabled={busy} aria-label={tr("planner:complete", { title: task.title })} onClick={() => {
              setBusy(true); void api.approve(crypto.randomUUID(), { type: "update-task", taskId: task.id, changes: { status: "done" } }).then(saved).catch(fail).finally(() => setBusy(false));
            }} icon={<Check />} />} subtitle={<><span>{courseTitle(task.courseId)} · {tr("planner:minutes", { minutes: task.estimateMinutes })}</span>
              <span>{tr(`planner:source_${task.source}`)} · {tr(`planner:status_${task.status}`)}</span>
              {task.dueAt && <time dateTime={task.dueAt} data-overdue={Date.parse(task.dueAt) < now}>{plannerDate(task.dueAt)}</time>}
            </>} />
          </li>)}</ul>
        </Section>
        {snapshot.tasks.some(t => plannerTaskDone(t, deadlines)) && <Section data-completed-tasks title={tr("planner:status_done")}><ul>{snapshot.tasks.filter(t => plannerTaskDone(t, deadlines)).map(t => <li key={t.id}><ListRow title={t.title} /></li>)}</ul></Section>}
        <Section title={tr("planner:source_deadlines")}><ul className="planner-task-list">{sourceDeadlines.map(d => <li key={d.id}><ListRow title={d.title} subtitle={<><span>{courseTitle(d.courseId)}</span><time dateTime={d.dueAt} data-overdue={Date.parse(d.dueAt) < now}>{plannerDate(d.dueAt)}</time>
          {Date.parse(d.dueAt) < now && <span>{tr("planner:overdue")}</span>}{d.submitted === null && <span>{tr("planner:submitted_unknown")}</span>}
        </>} /></li>)}</ul></Section>
        <Section title={tr("planner:exams")}>{!exams.length && <p className="planner-muted">{tr("planner:empty_exams")}</p>}
          {exams.map(exam => <article className="planner-exam" key={exam.id}><strong>{tr("planner:countdown", { title: exam.title, days: Math.max(0, Math.round((Date.parse(localDay(exam.date, zone)) - Date.parse(today)) / 86400000)) })}</strong>
            <p>{courseTitle(exam.courseId)} · {plannerDate(exam.date)}</p><p>{exam.scopeTopics.join(" · ") || tr("planner:scope_unknown")}</p></article>)}
        </Section>
      </div><section className=" planner-week" aria-label={tr("planner:week")}><Card elevation="none" className="p-6">
        <h2>{tr("planner:week")}</h2>{!snapshot.blocks.length && <p className="planner-muted">{tr("planner:empty_week")}</p>}
        {(view === "today" ? [today] : dayKeys).map(day => {
          const blocks = snapshot.blocks.filter(b => localDay(b.startsAt, zone) === day);
          return <section className="planner-day" key={day}><h3>{new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"))}</h3>
            <span className="planner-muted">{tr("planner:reserved", { minutes: blocks.reduce((n, b) => n + b.durationMinutes, 0) })}</span>
            <ol>{blocks.map(b => <li key={b.id}><ListRow title={b.title} subtitle={courseTitle(b.courseId)} meta={<time dateTime={b.startsAt}>{tr("planner:duration_window", { start: new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(b.startsAt)), minutes: b.durationMinutes })}</time>} /></li>)}</ol>
          </section>;
        })}
      </Card></section></div>}</>}</section>)}</div>
    </>}
  </section>;
}
