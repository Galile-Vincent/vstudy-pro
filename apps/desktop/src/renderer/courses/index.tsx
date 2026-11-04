import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  Unplug,
  WifiOff,
} from "lucide-react";
import type {
  MoodleCourse,
  MoodleCourseDetail,
  MoodleDeadline,
  MoodleOverview,
  MoodleSchool,
} from "../../shared/moodle";
import type { Document } from "../../shared";
import { tr, i18n } from "../../shared/i18n";
import { plainText } from "../../shared/plain-text";
import { useNavigate } from "../shell";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import { useMoodleApi, type MoodleApi } from "./api";
import { Reminder } from "./reminder";
import { CourseAgentPanel } from "./agent";
import "./courses.css";

const week = 7 * 86400000;
const tabs = [
  "overview",
  "deadlines",
  "notifications",
  "grades",
  "files",
] as const;
type Tab = (typeof tabs)[number];
export function deadlineGroup(deadline: MoodleDeadline, now = Date.now()) {
  if (deadline.submitted) return "done";
  const remaining = Date.parse(deadline.dueAt) - now;
  return remaining < 0 ? "overdue" : remaining <= week ? "this_week" : "later";
}
function date(value: string) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function relative(value: string) {
  const hours = (Date.parse(value) - Date.now()) / 3600000;
  const unit =
    Math.abs(hours) < 1 ? "minute" : Math.abs(hours) < 23.5 ? "hour" : "day";
  const valueInUnit =
    unit === "minute" ? hours * 60 : unit === "hour" ? hours : hours / 24;
  return new Intl.RelativeTimeFormat(i18n.resolvedLanguage || "en", {
    numeric: "auto",
  }).format(Math.round(valueInUnit), unit);
}
function courseStyle(id: string): CSSProperties {
  const colors = [
    "var(--folder-blue)",
    "var(--folder-sage)",
    "var(--folder-amber)",
  ];
  const hash = Array.from(id).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return { "--course-color": colors[hash % colors.length] } as CSSProperties;
}
function Cover({ course }: { course: MoodleCourse }) {
  return (
    <div className="moodle-cover" style={courseStyle(course.id)}>
      {course.imageUrl ? (
        <img src={course.imageUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <>
          <span className="moodle-cover-orbit" />
          <BookOpen aria-hidden="true" />
        </>
      )}
      <span className="moodle-course-code">{course.shortName}</span>
    </div>
  );
}

export function ConnectDialog({
  open,
  onOpenChange,
  api,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: MoodleApi;
  onConnected: () => Promise<void>;
}) {
  const [schools, setSchools] = useState<MoodleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<
    "loading" | "ready" | "connecting" | "error"
  >("loading");
  useEffect(() => {
    if (!open) return;
    let current = true;
    setStatus("loading");
    void api
      .schools()
      .then((items) => {
        if (current) {
          setSchools(items);
          setSchoolId(items[0]?.id ?? "");
          setStatus("ready");
        }
      })
      .catch(() => {
        if (current) setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [open, api, revision]);
  const connect = async () => {
    setStatus("connecting");
    try {
      await api.connect(schoolId);
      await onConnected();
      onOpenChange(false);
    } catch {
      setStatus("error");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="moodle-connect">
        <GraduationCap />
        <DialogTitle>{tr("moodle:connect_title")}</DialogTitle>
        <DialogDescription>
          {tr("moodle:connect_description")}
        </DialogDescription>
        <label htmlFor="moodle-school">{tr("moodle:school")}</label>
        <select
          id="moodle-school"
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          disabled={status === "loading" || status === "connecting"}
        >
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {status === "error" && (
          <div role="alert">
            <p>{tr("moodle:connect_error")}</p>
            <Button
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              {tr("moodle:retry")}
            </Button>
          </div>
        )}
        <Button
          disabled={
            !schoolId || status === "connecting" || status === "loading"
          }
          onClick={() => void connect()}
        >
          {status === "connecting" ? (
            <LoaderCircle className="moodle-spin" />
          ) : (
            <ArrowUpRight />
          )}
          {tr(status === "connecting" ? "moodle:connecting" : "moodle:sign_in")}
        </Button>
        <small>{tr("moodle:sign_in_hint")}</small>
      </DialogContent>
    </Dialog>
  );
}

export function CoursesView() {
  const api = useMoodleApi();
  const { route, navigate } = useNavigate();
  return (
    <Courses
      key={route.courseId ?? "home"}
      api={api}
      courseId={route.courseId}
      onCourse={(courseId) => navigate({ view: "courses", courseId })}
      onDocument={(documentId) =>
        navigate({
          view: "workspace",
          documentId: documentId as Document["id"],
        })
      }
    />
  );
}
export function Courses({
  api,
  courseId,
  onCourse,
  onDocument,
}: {
  api: MoodleApi;
  courseId?: string | undefined;
  onCourse: (id?: string) => void;
  onDocument: (id: string) => void;
}) {
  useTranslation("moodle");
  const [overview, setOverview] = useState<MoodleOverview>();
  const [schools, setSchools] = useState<MoodleSchool[]>([]);
  const [detail, setDetail] = useState<MoodleCourseDetail>();
  const [homeDetails, setHomeDetails] = useState<MoodleCourseDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [connect, setConnect] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [opening, setOpening] = useState<string>();
  const [agentRequest, setAgentRequest] = useState(0);
  const refresh = useCallback(async () => {
    const [next, schoolList, course] = await Promise.all([
      api.overview(),
      api.schools(),
      courseId ? api.course(courseId) : Promise.resolve(undefined),
    ]);
    const summaries = courseId
      ? []
      : await Promise.all(next.courses.map((course) => api.course(course.id)));
    setOverview(next);
    setSchools(schoolList);
    setDetail(course);
    setHomeDetails(summaries);
    setError(false);
  }, [api, courseId]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setDetail(undefined);
    setTab("overview");
    setAgentRequest(0);
    setNotice("");
    void Promise.all([
      api.overview(),
      api.schools(),
      courseId ? api.course(courseId) : Promise.resolve(undefined),
    ])
      .then(async ([next, schoolList, course]) => {
        const summaries = courseId
          ? []
          : await Promise.all(
              next.courses.map((course) => api.course(course.id)),
            );
        if (current) {
          setOverview(next);
          setSchools(schoolList);
          setDetail(course);
          setHomeDetails(summaries);
          setError(false);
        }
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, courseId]);
  const failure = () => setNotice(tr("moodle:action_error"));
  const sync = async () => {
    setSyncing(true);
    let incomplete = false;
    try { await api.sync(); } catch { incomplete = true; }
    try { await refresh(); } catch { incomplete = true; }
    setError(incomplete);
    setSyncing(false);
  };
  const exportCalendar = async (ids: string[]) => {
    try {
      await api.exportCalendar(ids);
      setNotice(tr("moodle:calendar_exported"));
    } catch {
      failure();
    }
  };
  const openFile = async (fileId: string) => {
    setOpening(fileId);
    try {
      const result = await api.openFile(fileId);
      onDocument(result.documentId);
    } catch {
      failure();
    } finally {
      setOpening(undefined);
    }
  };
  const dueSoon = (overview?.upcoming ?? [])
    .filter(
      (d) =>
        !d.submitted &&
        Date.parse(d.dueAt) >= Date.now() &&
        Date.parse(d.dueAt) <= Date.now() + week,
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const reminders =
    detail?.reminders ?? homeDetails.flatMap((d) => d.reminders);
  const remind = (deadline: MoodleDeadline) => (
    <Reminder
      deadline={deadline}
      reminders={reminders}
      api={api}
      onChange={refresh}
      onError={failure}
    />
  );
  const deadlines = (items: MoodleDeadline[]) =>
    items.length ? (
      <div className="moodle-rows">
        {items.map((d) => (
          <div className="moodle-row" key={d.id}>
            <span className="moodle-row-icon">
              {d.submitted ? <Check /> : <CalendarDays />}
            </span>
            <div className="moodle-row-main">
              <strong>{d.title}</strong>
              <small>
                <span>{tr(`moodle:${d.kind}`)}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={d.dueAt}>{date(d.dueAt)}</time>
                {d.submitted && (
                  <span className="moodle-chip">{tr("moodle:submitted")}</span>
                )}
              </small>
            </div>
            <span
              className="moodle-relative"
              data-overdue={!d.submitted && Date.parse(d.dueAt) < Date.now()}
            >
              {d.submitted ? tr("moodle:done") : relative(d.dueAt)}
            </span>
            {remind(d)}
            <Button
              variant="ghost"
              size="icon"
              aria-label={tr("moodle:calendar_for", { title: d.title })}
              onClick={() => void exportCalendar([d.id])}
            >
              <CalendarDays />
            </Button>
          </div>
        ))}
      </div>
    ) : (
      <p className="moodle-empty-inline">{tr("moodle:no_deadlines")}</p>
    );
  const notifications = (limit?: number) => {
    const items = [...(detail?.notifications ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return items.length ? (
      <div className="moodle-notifications">
        {items.map((n) => (
          <article
            key={n.id}
            className="moodle-notification"
            data-unread={!n.read}
          >
            <div className="moodle-section-heading">
              <h3>
                {!n.read && (
                  <span
                    className="moodle-unread"
                    aria-label={tr("moodle:unread")}
                  />
                )}
                {n.subject}
              </h3>
              <time dateTime={n.createdAt}>{relative(n.createdAt)}</time>
            </div>
            <p>{plainText(n.body)}</p>
            <div className="moodle-notification-actions">
              {!n.read && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api.markRead(n.id);
                      await refresh();
                    } catch {
                      failure();
                    }
                  }}
                >
                  <Check />
                  {tr("moodle:mark_read")}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => setAgentRequest((n) => n + 1)}
              >
                {tr("moodle:explain_prepare")}
                <ArrowUpRight />
              </Button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <p className="moodle-empty-inline">{tr("moodle:no_notifications")}</p>
    );
  };
  const files = (limit?: number) => {
    const allFiles = detail?.files ?? [];
    const items =
      limit === undefined
        ? allFiles
        : [...allFiles]
            .sort((a, b) =>
              (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""),
            )
            .slice(0, limit);
    return items.length ? (
      [...new Set(items.map((f) => f.section))].map((section) => (
        <section className="moodle-file-section" key={section}>
          <h3>{section}</h3>
          {items
            .filter((f) => f.section === section)
            .map((f) => (
              <button
                type="button"
                className="moodle-file-row"
                key={f.id}
                disabled={!!opening}
                onClick={() => void openFile(f.id)}
              >
                <span className="moodle-file-icon">
                  <FileText />
                  <small>{f.name.split(".").pop()?.toUpperCase()}</small>
                </span>
                <span className="moodle-row-main">
                  <strong>{f.name}</strong>
                  <small>
                    {new Intl.NumberFormat(i18n.resolvedLanguage, {
                      style: "unit",
                      unit: "megabyte",
                      maximumFractionDigits: 1,
                    }).format(f.size / 1000000)}
                    <span aria-hidden="true"> · </span>
                    {f.module}
                  </small>
                </span>
                <span className="moodle-chip">
                  {tr(
                    opening === f.id
                      ? "moodle:converting"
                      : f.documentId
                        ? "moodle:ready"
                        : "moodle:not_opened",
                  )}
                </span>
                {opening === f.id ? (
                  <LoaderCircle className="moodle-spin" />
                ) : (
                  <ArrowUpRight />
                )}
              </button>
            ))}
        </section>
      ))
    ) : (
      <p className="moodle-empty-inline">{tr("moodle:no_files")}</p>
    );
  };
  return (
    <main className="moodle-page">
      <div className="moodle-content">
        <header className="moodle-header">
          <div>
            {courseId && (
              <Button
                className="moodle-back"
                variant="ghost"
                onClick={() => onCourse()}
              >
                <ArrowLeft />
                {tr("moodle:all_courses")}
              </Button>
            )}
            {!courseId && (
              <>
                <p className="moodle-eyebrow">{tr("moodle:learning_space")}</p>
                <h1>{tr("moodle:courses")}</h1>
              </>
            )}
            <p>
              {courseId
                ? tr("moodle:course_subtitle")
                : tr("moodle:home_subtitle")}
            </p>
          </div>
          <Button variant="outline" onClick={() => setConnect(true)}>
            <GraduationCap />
            {tr("moodle:connect_school")}
          </Button>
        </header>
        <div role="status" aria-live="polite">
          {notice && (
            <div className="moodle-banner">
              {notice}
              <Button variant="ghost" onClick={() => setNotice("")}>
                {tr("moodle:dismiss")}
              </Button>
            </div>
          )}
        </div>
        {error && (
          <div className="moodle-banner" role="alert">
            <WifiOff />
            <span>
              {tr(overview ? "moodle:offline_stale" : "moodle:load_error")}
            </span>
            <Button
              variant="outline"
              disabled={syncing}
              onClick={() => void sync()}
            >
              {tr("moodle:retry")}
            </Button>
          </div>
        )}
        {!!overview?.accounts.length && (
          <div className="moodle-accounts">
            {overview.accounts.map((account) => (
              <div key={account.id} className="moodle-account">
                <span className="moodle-avatar">
                  <GraduationCap />
                </span>
                <div>
                  <strong>{account.displayName}</strong>
                  <span>
                    {schools.find((s) => s.id === account.schoolId)?.name ??
                      account.schoolId}
                  </span>
                </div>
                <small>
                  {account.syncedAt
                    ? tr("moodle:synced", { time: relative(account.syncedAt) })
                    : tr("moodle:not_synced")}
                </small>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tr("moodle:refresh")}
                  disabled={syncing}
                  onClick={() => void sync()}
                >
                  <RefreshCw className={syncing ? "moodle-spin" : ""} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tr("moodle:disconnect")}
                  onClick={async () => {
                    try {
                      await api.disconnect(account.id);
                      if (courseId) onCourse();
                      else await refresh();
                    } catch {
                      failure();
                    }
                  }}
                >
                  <Unplug />
                </Button>
                {account.status === "expired" && (
                  <div className="moodle-expired" role="alert">
                    {tr("moodle:expired")}
                    <Button variant="outline" onClick={() => setConnect(true)}>
                      {tr("moodle:reconnect")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {loading ? (
          <div
            className="moodle-grid"
            role="status"
            aria-label={tr("moodle:loading")}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="moodle-skeleton" />
            ))}
          </div>
        ) : courseId ? (
          detail ? (
            <>
              <div className="moodle-hero">
                <Cover course={detail.course} />
                <div>
                  <span className="moodle-eyebrow">
                    {detail.course.shortName}
                  </span>
                  <h1>{detail.course.fullName}</h1>
                  <p>
                    {tr("moodle:course_progress", {
                      count: detail.course.progress ?? 0,
                    })}
                  </p>
                  <progress
                    max={100}
                    value={detail.course.progress ?? 0}
                    aria-label={tr("moodle:progress")}
                  />
                </div>
              </div>
              <div className="moodle-course-layout">
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as Tab)}
                  className="moodle-tabs"
                >
                  <TabsList
                    variant="line"
                    aria-label={tr("moodle:course_sections")}
                  >
                    {tabs.map((key) => (
                      <TabsTrigger key={key} value={key}>
                        {tr(`moodle:${key}`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="overview">
                    <section className="moodle-panel">
                      <div className="moodle-section-heading">
                        <h2>{tr("moodle:up_next")}</h2>
                        <Button
                          variant="ghost"
                          onClick={() => setTab("deadlines")}
                        >
                          {tr("moodle:view_all")}
                          <ChevronRight />
                        </Button>
                      </div>
                      {deadlines(
                        detail.deadlines
                          .filter((d) => !d.submitted)
                          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                          .slice(0, 1),
                      )}
                    </section>
                    <section className="moodle-panel">
                      <h2>{tr("moodle:latest_updates")}</h2>
                      {notifications(3)}
                    </section>
                    <section className="moodle-panel">
                      <div className="moodle-section-heading">
                        <h2>{tr("moodle:grade_summary")}</h2>
                        <Button
                          variant="ghost"
                          onClick={() => setTab("grades")}
                        >
                          {tr("moodle:view_all")}
                          <ChevronRight />
                        </Button>
                      </div>
                      <p className="moodle-panel-description">
                        {tr("moodle:graded_count", {
                          count: detail.grades.filter((g) => g.grade !== null)
                            .length,
                          total: detail.grades.length,
                        })}
                      </p>
                      <div className="moodle-grade-summary">
                        {detail.grades
                          .filter((g) => g.percentage !== null)
                          .slice(0, 3)
                          .map((grade, index) => (
                            <div key={index}>
                              <span>{grade.name}</span>
                              <strong>
                                {new Intl.NumberFormat(i18n.resolvedLanguage, {
                                  style: "percent",
                                  maximumFractionDigits: 0,
                                }).format(grade.percentage! / 100)}
                              </strong>
                              <progress
                                max={100}
                                value={grade.percentage!}
                                aria-label={grade.name}
                              />
                            </div>
                          ))}
                      </div>
                    </section>
                    <section className="moodle-panel">
                      <div className="moodle-section-heading">
                        <h2>{tr("moodle:recent_files")}</h2>
                        <Button variant="ghost" onClick={() => setTab("files")}>
                          {tr("moodle:view_all")}
                          <ChevronRight />
                        </Button>
                      </div>
                      {files(2)}
                    </section>
                  </TabsContent>
                  <TabsContent value="deadlines">
                    <section className="moodle-panel">
                      <div className="moodle-section-heading">
                        <h2>{tr("moodle:deadlines")}</h2>
                        <Button
                          variant="outline"
                          disabled={!detail.deadlines.length}
                          onClick={() =>
                            void exportCalendar(
                              detail.deadlines.map((d) => d.id),
                            )
                          }
                        >
                          <CalendarDays />
                          {tr("moodle:export_calendar")}
                        </Button>
                      </div>
                      {(["overdue", "this_week", "later", "done"] as const).map(
                        (group) => (
                          <section
                            className="moodle-deadline-group"
                            key={group}
                          >
                            <h3 data-overdue={group === "overdue"}>
                              {tr(`moodle:${group}`)}
                              <span>
                                {
                                  detail.deadlines.filter(
                                    (d) => deadlineGroup(d) === group,
                                  ).length
                                }
                              </span>
                            </h3>
                            {deadlines(
                              detail.deadlines
                                .filter((d) => deadlineGroup(d) === group)
                                .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
                            )}
                          </section>
                        ),
                      )}
                    </section>
                  </TabsContent>
                  <TabsContent value="notifications">
                    <section className="moodle-panel">
                      <h2>{tr("moodle:notifications")}</h2>
                      {notifications()}
                    </section>
                  </TabsContent>
                  <TabsContent value="grades">
                    <section className="moodle-panel">
                      <h2>{tr("moodle:grades")}</h2>
                      {detail.grades.length ? (
                        <div className="moodle-table-scroll">
                          <table className="moodle-grades">
                            <thead>
                              <tr>
                                {[
                                  "grade_item",
                                  "grade",
                                  "maximum",
                                  "percentage",
                                ].map((key) => (
                                  <th key={key}>{tr(`moodle:${key}`)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detail.grades.map((g, index) => (
                                <tr key={index}>
                                  <th scope="row">{g.name}</th>
                                  <td>{g.grade ?? tr("moodle:ungraded")}</td>
                                  <td>{g.max ?? tr("moodle:ungraded")}</td>
                                  <td>
                                    {g.percentage === null ? (
                                      tr("moodle:ungraded")
                                    ) : (
                                      <>
                                        <span>
                                          {new Intl.NumberFormat(
                                            i18n.resolvedLanguage,
                                            {
                                              style: "percent",
                                              maximumFractionDigits: 0,
                                            },
                                          ).format(g.percentage / 100)}
                                        </span>
                                        <progress
                                          value={g.percentage}
                                          max={100}
                                          aria-label={g.name}
                                        />
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="moodle-empty-inline">
                          {tr("moodle:no_grades")}
                        </p>
                      )}
                    </section>
                  </TabsContent>
                  <TabsContent value="files">
                    <section className="moodle-panel">
                      <h2>{tr("moodle:files")}</h2>
                      <p className="moodle-panel-description">
                        {tr("moodle:files_hint")}
                      </p>
                      {files()}
                    </section>
                  </TabsContent>
                </Tabs>
                <CourseAgentPanel
                  key={detail.course.id}
                  detail={detail}
                  api={api}
                  requested={agentRequest}
                  onChange={refresh}
                  onError={failure}
                />
              </div>
            </>
          ) : (
            <div className="moodle-empty">
              <BookOpen />
              <h2>{tr("moodle:course_unavailable")}</h2>
              <Button variant="outline" onClick={() => onCourse()}>
                {tr("moodle:all_courses")}
              </Button>
            </div>
          )
        ) : overview?.courses.length ? (
          <>
            <section className="moodle-due-section">
              <div className="moodle-section-heading">
                <h2>
                  <Clock3 />
                  {tr("moodle:due_soon")}
                </h2>
                <span>{tr("moodle:next_seven_days")}</span>
              </div>
              {dueSoon.length ? (
                <div className="moodle-due-strip">
                  {dueSoon.map((d) => {
                    const course = overview.courses.find(
                      (c) => c.id === d.courseId,
                    );
                    return (
                      <article
                        key={d.id}
                        className="moodle-due-card"
                        style={courseStyle(d.courseId)}
                      >
                        <div className="moodle-section-heading">
                          <small>
                            <span className="moodle-color-dot" />
                            {course?.shortName}
                          </small>
                          {remind(d)}
                        </div>
                        <button
                          className="moodle-due-link"
                          onClick={() => onCourse(d.courseId)}
                        >
                          {d.title}
                        </button>
                        <time dateTime={d.dueAt}>
                          {relative(d.dueAt)}
                          <span>{date(d.dueAt)}</span>
                        </time>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="moodle-empty-inline">
                  {tr("moodle:all_caught_up")}
                </p>
              )}
            </section>
            <section>
              <div className="moodle-section-heading moodle-grid-heading">
                <h2>
                  {tr("moodle:your_courses")}
                  <span className="moodle-chip">{overview.courses.length}</span>
                </h2>
                <span>
                  {tr("moodle:unread_count", {
                    count: overview.unreadNotifications,
                  })}
                </span>
              </div>
              <div className="moodle-grid">
                {overview.courses.map((course) => (
                  <button
                    key={course.id}
                    className="moodle-course-card"
                    onClick={() => onCourse(course.id)}
                  >
                    <Cover course={course} />
                    <div className="moodle-card-body">
                      <h3>{course.fullName}</h3>
                      <div className="moodle-progress-label">
                        <span>{tr("moodle:progress")}</span>
                        <strong>
                          {course.progress === null
                            ? tr("moodle:not_available")
                            : new Intl.NumberFormat(i18n.resolvedLanguage, {
                                style: "percent",
                              }).format(course.progress / 100)}
                        </strong>
                      </div>
                      <progress
                        max={100}
                        value={course.progress ?? 0}
                        aria-label={tr("moodle:progress")}
                      />
                      <footer>
                        <span>
                          <CalendarDays />
                          {tr("moodle:due_count", {
                            count: dueSoon.filter(
                              (d) => d.courseId === course.id,
                            ).length,
                          })}
                        </span>
                        <span>
                          {tr("moodle:course_unread", {
                            count:
                              homeDetails
                                .find((d) => d.course.id === course.id)
                                ?.notifications.filter((n) => !n.read).length ??
                              0,
                          })}
                          <ArrowUpRight />
                        </span>
                      </footer>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          !error && (
            <div className="moodle-empty">
              <GraduationCap />
              <h2>{tr("moodle:empty_title")}</h2>
              <p>{tr("moodle:empty_description")}</p>
              <Button onClick={() => setConnect(true)}>
                {tr("moodle:connect_school")}
              </Button>
            </div>
          )
        )}
        <ConnectDialog
          open={connect}
          onOpenChange={setConnect}
          api={api}
          onConnected={refresh}
        />
      </div>
    </main>
  );
}
