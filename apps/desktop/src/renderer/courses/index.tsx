import { Brand } from '../components/brand';
import { MoodleWebviewProvider, useMoodleWebview } from './webview';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUpRight,
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
  MoodleCourseDetail,
  MoodleDeadline,
  MoodleOverview,
  MoodleNotification,
} from "../../shared/moodle";
import type { Document } from "../../shared";
import { tr, i18n } from "../../shared/i18n";
import { plainText } from "../../shared/plain-text";
import { useNavigate } from "../shell";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import { useMoodleApi, type MoodleApi } from "./api";
import { Reminder } from "./reminder";
import { CourseAssistant } from "./assistant";
import { CourseContent, Announcements } from "./content";
import {
  displayTitle,
  displayTeachers,
  displayClass,
  matchesTerm,
} from "../../shared/moodle-course-display";
import type { MoodleTermFilter } from "../../shared/moodle-course";
import "./art/tokens.css";
import "./courses.css";
import { CourseArtwork, CourseCover as Cover, courseArt } from "./art/cover";
import "./art/surfaces.css";
import { ConnectDialog } from "./connect";
import { Planner } from "./planner";
export { ConnectDialog } from "./connect";

const week = 7 * 86400000;
const tabs = [
  "content",
  "deadlines",
  "announcements",
  "grades",
  "files",
  "notifications",
] as const;
type Tab = (typeof tabs)[number];
const termFilters = ["current", "future", "past", "all"] as const;
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
function IdentityLine({value, label}: {value: string; label: string}) {
  return <p className="moodle-identity-line">{value || <span className="moodle-identity-unknown" aria-label={label}>—</span>}</p>;
}

export function CoursesView() {
  const api = useMoodleApi();
  const { route, navigate } = useNavigate();
  return (
    <Courses
      key={route.courseId ?? "home"}
      api={api}
      courseId={route.courseId}
      connectOnMount={route.connectSchool}
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
export function Courses(props: Parameters<typeof CoursesBody>[0]) {
  const [reconnect,setReconnect] = useState(false);
  return <MoodleWebviewProvider onDocument={props.onDocument} onReconnect={() => setReconnect(true)}>
    <CoursesBody {...props} reconnect={reconnect} onReconnected={() => setReconnect(false)} />
  </MoodleWebviewProvider>;
}
function CoursesBody({
  reconnect,
  onReconnected,
  api,
  courseId,
  connectOnMount,
  onCourse,
  onDocument,
}: {
  reconnect?: boolean;
  onReconnected?: () => void;
  api: MoodleApi;
  courseId?: string | undefined;
  connectOnMount?: boolean | undefined;
  onCourse: (id?: string) => void;
  onDocument: (id: string) => void;
}) {
  useTranslation("moodle");
  const [showPlanner, setShowPlanner] = useState(false);
  const openMoodle = useMoodleWebview();
  const [overview, setOverview] = useState<MoodleOverview>();
  const [detail, setDetail] = useState<MoodleCourseDetail>();
  const [homeDetails, setHomeDetails] = useState<NonNullable<MoodleOverview["summaries"]>>([]);
  const [loading, setLoading] = useState(true);
  const [progress,setProgress] = useState<import("../../shared/ipc").MoodleProgress>();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [connect, setConnect] = useState(!!connectOnMount);
  useEffect(() => {if (reconnect) {setConnect(true);onReconnected?.();}},[reconnect,onReconnected]);
  const [tab, setTab] = useState<Tab>("content");
  const [term, setTerm] = useState<MoodleTermFilter>("current");
  const lang = i18n.resolvedLanguage || "en";
  const [opening, setOpening] = useState<string>();
  const [agentRequest, setAgentRequest] = useState(0);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const [next, course] = await Promise.all([
      api.overview(),
      courseId ? api.course(courseId) : Promise.resolve(undefined),
    ]);
    const summaries = next.summaries ?? [];
    if (sequence !== refreshSequence.current) return;
    setOverview(next);
    setDetail(course);
    setHomeDetails(summaries);
    setError(false);
  }, [api, courseId]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setDetail(undefined);
    setTab("content");
    setAgentRequest(0);
    setNotice("");
    void refresh()
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      refreshSequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout> | undefined;
    const unsubscribe=api.onProgress?.(event => {
    if (event.courseId && event.courseId !== courseId) return;
    if (!event.courseId) {setProgress(event);setSyncing(event.state === 'loading');}
    if (event.state === 'error') setError(true);
    if (!timer) timer=setTimeout(() => {timer=undefined;void refresh().catch(() => setError(true));},50);
    });
    return () => {clearTimeout(timer);unsubscribe?.();};
  },[api,courseId,refresh]);

  const panelStatus = (...names:import('../../shared/moodle').MoodlePanel[]) => {
    const states=names.map(name => detail?.panels?.[name]);
    return <>
      {states.includes('loading') && <div role="status" aria-label={tr('moodle:loading')}><Skeleton className="moodle-skeleton" /></div>}
      {states.includes('error') && <p role="alert">{tr(`moodle:panel_error_${names.map(name => detail?.panelErrors?.[name]).find(Boolean) ?? 'service'}`)} <button onClick={() => void sync()}>{tr('moodle:retry')}</button></p>}
    </>;
  };
  const failure = () => setNotice(tr("moodle:action_error"));
  const sync = async () => {
    setSyncing(true);
    let incomplete = false;
    try {
      if (courseId) await api.course(courseId,true);
      else await api.sync();
    } catch {
      incomplete = true;
    }
    try {
      await refresh();
    } catch {
      incomplete = true;
    }
    setError(incomplete);
    setSyncing(false);
  };
  const exportCalendar = async (ids: string[]) => {
    try {
      if (!(await api.exportCalendar(ids)).saved) return;
      setNotice(tr("moodle:calendar_exported"));
    } catch {
      failure();
    }
  };
  const disconnect = async (accountId: string) => {
    try {
      await api.disconnect(accountId);
      if (courseId) onCourse();
      else await refresh();
    } catch { failure(); }
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
          <div className="moodle-row" key={d.id} data-deadline-group={deadlineGroup(d)}>
            <span className="moodle-row-icon">
              {d.submitted ? <Check /> : <CalendarDays />}
            </span>
            <div className="moodle-row-main">
              <strong>{d.title}</strong>
              <small>
                <span>{tr(`moodle:${d.kind}`)}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={d.dueAt}>{date(d.dueAt)}</time>
                {d.submitted === null && (
                  <span className="moodle-chip">
                    {tr("moodle:submission_unknown")}
                  </span>
                )}
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
            {d.url && <Button variant="ghost" aria-label={tr('webview:open')} onClick={() => {
              const course = overview?.courses.find(c => c.id === d.courseId);
              if (course && d.url) openMoodle(course.accountId,{kind:'page',url:d.url});
            }}><ArrowUpRight /></Button>}
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
  const notifications = (
    limit?: number,
    source: MoodleNotification[] = detail?.notifications ?? [],
  ) => {
    const items = [...source]
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
                    role="img"
                    aria-label={tr("moodle:unread")}
                  />
                )}
                {n.subject}
              </h3>
              <time dateTime={n.createdAt}>{relative(n.createdAt)}</time>
            </div>
            <p>{plainText(n.body)}</p>
            <div className="moodle-notification-actions">
              {n.url && <Button variant="ghost" onClick={() => openMoodle(n.accountId,{kind:'page',url:n.url!})}>{tr('webview:open')}<ArrowUpRight /></Button>}
              {!n.read && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api.markRead(n.id);
                    } catch {
                      failure();
                      return;
                    }
                    await refresh().catch(() => setError(true));
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
              <div className="moodle-file-actions" key={f.id}>
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
              <Button variant="ghost" size="icon" aria-label={tr('webview:open')} title={tr('webview:open')} onClick={() => openMoodle(detail!.course.accountId,{kind:'file',fileId:f.id})}><ArrowUpRight /></Button>
              </div>
            ))}
        </section>
      ))
    ) : (
      <p className="moodle-empty-inline">{tr("moodle:no_files")}</p>
    );
  };
  if (showPlanner) return <main className="moodle-page"><div className="moodle-content">
    <Button variant="ghost" className="moodle-back" onClick={() => setShowPlanner(false)}><ArrowLeft />{tr("planner:back")}</Button>
    <Planner courses={overview?.courses ?? []} deadlines={overview?.upcoming ?? []} />
  </div></main>;
  const header = (
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
            {!courseId && <h1>{tr("moodle:courses")}</h1>}
            {!courseId && <p>{tr("moodle:home_subtitle")}</p>}
          </div>
          <div className="moodle-header-actions">
          {detail && <Button variant="ghost" size="icon" aria-label={tr("moodle:disconnect")} title={tr("moodle:disconnect")} onClick={() => void disconnect(detail.course.accountId)}><Unplug /></Button>}
          <Button variant="outline" className="planner-entry" onClick={() => setShowPlanner(true)}><CalendarDays />{tr("planner:title")}</Button>
          <Button variant="outline" onClick={() => setConnect(true)}>
            <GraduationCap />
            {tr("moodle:connect_school")}
          </Button>
          </div>
        </header>
  );
  return (
    <main className="moodle-page" data-course={Boolean(detail)}>
      <div className="moodle-content">
        {!detail && header}
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
        {!!overview?.accounts.length && (!courseId || overview.accounts.some(account => account.status === "expired" || account.signInStorage)) && (
          <div className="moodle-accounts">
            {overview.accounts.map((account) => (
              <div key={account.id} className="moodle-account">
                <span className="moodle-avatar">
                  <GraduationCap />
                </span>
                <div>
                  <strong>{account.displayName}</strong>
                  <span>
                    {account.siteName} · {new URL(account.siteUrl).host}
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
                  onClick={() => void disconnect(account.id)}
                >
                  <Unplug />
                </Button>
                {account.signInStorage && <div role="status">
                  <p>{tr(account.signInStorage === 'unsaved' ? 'moodle:keychain_unsaved' : 'moodle:keychain_session')}</p>
                  <Button onClick={async () => {
                    try {await api.retrySave(account.id);await refresh();} catch {failure();}
                  }}>{tr('moodle:keychain_retry')}</Button>
                </div>}
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
        {progress?.state === 'loading' && <p role="status">{tr('moodle:sync_progress',{completed:progress.completed,total:progress.total})}</p>}
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
              <div className="moodle-hero" style={courseArt(detail.course.id, detail.course.identity.term).style}>
                <CourseArtwork course={detail.course} />
                <div className="moodle-hero-navigation">{header}</div>
                <div className="moodle-hero-body">
                  <span className="moodle-eyebrow">
                    {[detail.course.identity.term, detail.course.identity.code]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <h1>
                    {displayTitle(
                      detail.course.identity,
                      lang,
                      detail.course.fullName,
                    )}
                  </h1>
                  <p className="muted" data-testid="course-cache-state">{tr('storage:cached_'+(detail.cacheState ?? 'stale'))}{' · '}{detail.lastSyncedAt ? tr('storage:last_synced',{time:relative(detail.lastSyncedAt)}) : tr('storage:never_synced')}</p>
                  <div className="moodle-hero-meta">
                  <IdentityLine value={displayTeachers(detail.course.identity, lang)} label={tr("moodle:teacher_unknown")} />
                  <IdentityLine value={displayClass(detail.course.identity)} label={tr("moodle:class_unknown")} />
                  </div>
                  <div className="moodle-hero-actions">
                  <Button variant="outline" disabled={syncing} onClick={() => void sync()}><RefreshCw className={syncing ? "moodle-spin" : ""} />{tr("moodle:refresh")}</Button>
                  <Button variant="outline" onClick={() => {
                    const account = overview?.accounts.find(a => a.id === detail.course.accountId);
                    if (account) openMoodle(account.id,{kind:'page',url:account.siteUrl + '/course/view.php?id=' + detail.course.remoteId});
                  }}><ArrowUpRight />{tr('webview:open')}</Button>
                  </div>
                  <details className="moodle-raw-name">
                    <summary>{tr("moodle:original_name")}</summary>
                    {detail.course.fullName}
                  </details>
                  {detail.deadlines
                    .filter(
                      (d) => !d.submitted && Date.parse(d.dueAt) >= Date.now(),
                    )
                    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                    .slice(0, 1)
                    .map((d) => (
                      <p key={d.id} className="moodle-hero-next">
                        {tr("moodle:up_next")} · {d.title} · {relative(d.dueAt)}
                      </p>
                    ))}

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
                  <TabsContent value="content">
                    <div className="moodle-content-summary">
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
                            .filter(
                              (d) =>
                                !d.submitted &&
                                Date.parse(d.dueAt) >= Date.now(),
                            )
                            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                            .slice(0, 1),
                        )}
                      </section>
                      <section className="moodle-panel">
                        <h2>{tr("moodle:latest_updates")}</h2>
                        {notifications(3)}
                      </section>
                    </div>
                    {detail.course.identity.teachers.length > 0 && (
                      <p className="moodle-people">
                        <strong>{tr("moodle:people")}</strong> ·{" "}
                        {displayTeachers(detail.course.identity, lang)}
                      </p>
                    )}
                    {panelStatus('contents','completion','teachers')}
                    {detail.contentsPartial && <p role="status">{tr('moodle:contents_partial')}</p>}
                    <CourseContent
                      detail={detail}
                      openFile={openFile}
                      onError={failure}
                    />
                  </TabsContent>
                  <TabsContent value="deadlines" aria-busy={detail.fetchState === "loading"}>
                    {panelStatus('assignments','quizzes')}
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
                  <TabsContent value="announcements" aria-busy={detail.fetchState === "loading"}>
                    {panelStatus('announcements')}
                    <Announcements accountId={detail.course.accountId} items={detail.announcements} />
                  </TabsContent>
                  <TabsContent value="notifications">
                    <section className="moodle-panel">
                      <h2>{tr("moodle:notifications")}</h2>
                      {notifications()}
                    </section>
                  </TabsContent>
                  <TabsContent value="grades" aria-busy={detail.fetchState === "loading"}>
                    {panelStatus('grades')}
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
                <CourseAssistant
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
              <Brand/>
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
                        data-deadline-group={deadlineGroup(d)}
                        style={courseArt(d.courseId, course?.identity.term ?? null).style}
                      >
                        <div className="moodle-due-meta"><span className="moodle-due-course">{course?.identity.code || course?.shortName}</span><span className="moodle-urgency" data-urgent={Date.parse(d.dueAt) - Date.now() < 86400000}>{tr("courses-art:due_relative", {time: relative(d.dueAt)})}</span></div>
                        <h3><button className="moodle-due-link" onClick={() => onCourse(d.courseId)}>{d.title}</button></h3>
                        <footer><time dateTime={d.dueAt}>{date(d.dueAt)}</time>{remind(d)}</footer>
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
              <Tabs
                value={term}
                onValueChange={(value) => setTerm(value as MoodleTermFilter)}
                className="moodle-term-tabs"
              >
                <TabsList aria-label={tr("moodle:term_filter")}>
                  {termFilters.map(
                    (filter) => (
                      <TabsTrigger key={filter} value={filter}>
                        {tr(`moodle:term_${filter}`)}
                        <span className="moodle-chip">
                          {
                            overview.courses.filter((course) =>
                              matchesTerm(course, filter),
                            ).length
                          }
                        </span>
                      </TabsTrigger>
                    ),
                  )}
                </TabsList>
                {termFilters.map((filter) => (
                  <TabsContent key={filter} value={filter}>
                    {!overview.courses.some((course) =>
                      matchesTerm(course, filter),
                    ) && (
                      <p className="moodle-empty-inline">
                        {tr("moodle:no_term_courses")}
                      </p>
                    )}
                    <div className="moodle-grid">
                      {overview.courses
                        .filter((course) => matchesTerm(course, filter))
                        .map((course, index) => {
                          const next = dueSoon.find(d => d.courseId === course.id);
                          const unread = homeDetails.find(d => d.course.id === course.id)?.notifications.filter(n => !n.read).length ?? 0;
                          return <article
                            key={course.id}
                            className="moodle-course-card"
                            style={{...courseArt(course.id, course.identity.term).style, animationDelay: `${index * 30}ms`, ...(index >= 6 ? {animation: "none"} : {})}}
                            title={[course.fullName, course.identity.lifecycle === "unknown" ? tr("moodle:dates_unavailable") : null].filter(Boolean).join(" · ")}
                          >
                            <Cover course={course} deadline={{label: next ? tr("courses-art:due_relative", {time: relative(next.dueAt)}) : tr("courses-art:no_due"), urgent: !!next && Date.parse(next.dueAt) - Date.now() < 86400000}} />
                            <div className="moodle-card-body">
                              <h3><button type="button" onClick={() => onCourse(course.id)}>{displayTitle(course.identity, lang, course.fullName)}</button></h3>
                              <IdentityLine value={displayTeachers(course.identity, lang)} label={tr("moodle:teacher_unknown")} />
                              <footer>
                                <span className="moodle-card-class">{displayClass(course.identity)}</span>
                                <span className="moodle-card-unread">{unread > 0 && <span className="moodle-unread" aria-hidden="true" />}{tr("moodle:course_unread", {count: unread})}<ArrowUpRight /></span>
                              </footer>
                            </div>
                          </article>;
                        })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </section>
          </>
        ) : (
          !error && (
            <div className="moodle-empty">
              <GraduationCap />
              <h2>
                {tr(
                  overview?.accounts.length
                    ? overview.accounts.some((account) => !account.syncedAt)
                      ? "moodle:syncing"
                      : "moodle:no_courses"
                    : "moodle:empty_title",
                )}
              </h2>
              {!overview?.accounts.length && (
                <p>{tr("moodle:empty_description")}</p>
              )}
              {!overview?.accounts.length && (
                <Button onClick={() => setConnect(true)}>
                  {tr("moodle:connect_school")}
                </Button>
              )}
            </div>
          )
        )}
        {!courseId && Boolean(overview?.otherNotifications?.length) && (
          <section className="moodle-panel">
            <h2>{tr("moodle:other_notifications")}</h2>
            {notifications(undefined, overview?.otherNotifications)}
          </section>
        )}
        <ConnectDialog
          accounts={overview?.accounts}
          open={connect}
          onOpenChange={setConnect}
          api={api}
          onConnected={refresh}
        />
      </div>
    </main>
  );
}
