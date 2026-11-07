import { performDocumentAction, type DocumentAction } from '../document-open';
import { documentIdSchema } from '../../shared/domain';
import { Brand } from '../components/brand';
import { MoodleWebviewProvider, useMoodleWebview } from './webview';
import {
  useCallback,
  useEffect,
  useMemo,
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
  Inbox,
  AlarmClock,
  Mail,
  Pin,
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
import "./art/surfaces.css";
import { ConnectDialog } from "./connect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Planner } from "./planner";
import { courseAttention } from "./attention";
import { orderCourses, type CourseSort, type CourseSortPreferences } from "../../shared/moodle-course-order";
import { useCourseMovement } from "./row-movement";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { UpdatesInbox } from "./updates";
import { useScrollFades } from "./scroll-fades";
import "./home.css";
import { CourseViewSwitch } from "./view-switch";
import { loadCourseViewMode, saveCourseViewMode, type CourseViewMode } from "./view-mode";
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
function deadlinePhrase(value: string) {
  const now = new Date(), due = new Date(value);
  const day = (Date.UTC(due.getFullYear(),due.getMonth(),due.getDate()) - Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())) / 86400000;
  if (Date.parse(value)-Date.now() >= 86400000 && day === 1) return tr('moodle:due_tomorrow');
  if (day === 2) return tr('moodle:due_day_after_tomorrow');
  return tr('moodle:next_due',{time:relative(value)});
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
  const pageRef = useRef<HTMLElement>(null);
  useScrollFades(pageRef);
  const [showUpdates, setShowUpdates] = useState(false);
  const [allDue, setAllDue] = useState(false);
  const updatesTrigger = useRef<HTMLButtonElement>(null);
  const disconnectTrigger = useRef<HTMLButtonElement>(null);
  const disconnectSchool = useRef<string | undefined>(undefined);
  const [showPlanner, setShowPlanner] = useState(false);
  const openMoodle = useMoodleWebview();
  const [overview, setOverview] = useState<MoodleOverview>();
  const [orderSnapshot,setOrderSnapshot] = useState<{data:MoodleOverview;now:number}>();
  const [sortPreferences,setSortPreferences] = useState<CourseSortPreferences>({});
  const [pinBusy,setPinBusy] = useState<string>();
  const [view,setView] = useState<CourseViewMode>(loadCourseViewMode);
  const changeView = (mode: CourseViewMode) => {setView(mode);saveCourseViewMode(mode);};
  const prepareMovement = useRef<() => void>(() => {});
  const [detail, setDetail] = useState<MoodleCourseDetail>();
  const [homeDetails, setHomeDetails] = useState<NonNullable<MoodleOverview["summaries"]>>([]);
  const [loading, setLoading] = useState(true);
  const [progress,setProgress] = useState<import("../../shared/ipc").MoodleProgress>();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [connect, setConnect] = useState(!!connectOnMount);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string>();
  useEffect(() => {if (reconnect) {setConnect(true);onReconnected?.();}},[reconnect,onReconnected]);
  const [tab, setTab] = useState<Tab>("content");
  const [term, setTerm] = useState<MoodleTermFilter>("current");
  const lang = i18n.resolvedLanguage || "en";
  const [opening, setOpening] = useState<string>();
  const [agentRequest, setAgentRequest] = useState(0);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async (reorder = false) => {
    const sequence = ++refreshSequence.current;
    const [next, course] = await Promise.all([
      api.overview(),
      courseId ? api.course(courseId) : Promise.resolve(undefined),
    ]);
    const summaries = next.summaries ?? [];
    if (sequence !== refreshSequence.current) return;
    if (reorder) {prepareMovement.current();setOrderSnapshot({data:next,now:Date.now()});}
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
    void refresh(true)
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
  useEffect(() => {let current=true;void api.sortPreferences().then(value => {if(current)setSortPreferences(value);}).catch(failure);return () => {current=false;};},[api]);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout> | undefined;
    let reorder = false;
    const unsubscribe=api.onProgress?.(event => {
    if (event.courseId && event.courseId !== courseId) return;
    if (!event.courseId) {setProgress(event);setSyncing(event.state === 'loading');}
    if (event.state === 'error') setError(true);
    reorder ||= event.state === 'idle' && event.completed === event.total;
    if (!timer) timer=setTimeout(() => {timer=undefined;const completed=reorder;reorder=false;void refresh(completed).catch(() => setError(true));},50);
    });
    return () => {clearTimeout(timer);unsubscribe?.();};
  },[api,courseId,refresh]);

  const panelStatus = (...names:import('../../shared/moodle').MoodlePanel[]) => {
    const states=names.map(name => detail?.panels?.[name]);
    const retained = names.some(name => name === 'contents' || name === 'completion' ? !!detail?.sections.length : name === 'teachers' ? !!detail?.course.identity.teachers.length : name === 'assignments' || name === 'quizzes' ? !!detail?.deadlines.length : !!detail?.[name].length);
    return <>
      {states.includes('loading') && <div role="status" aria-busy="true" aria-label={tr('moodle:loading')}>{retained ? <span className="muted">{tr('moodle:loading')}</span> : <Skeleton className="moodle-skeleton" />}</div>}
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
      await refresh(true);
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
    setConfirmDisconnect(undefined);
    try {
      await api.disconnect(accountId);
      if (courseId) onCourse();
      else await refresh(true);
    } catch { failure(); }
  };
  const openFile = async (fileId: string, action?: DocumentAction) => {
    setOpening(fileId);
    try {
      const result = await api.openFile(fileId);
      const documentId = documentIdSchema.parse(result.documentId);
      const outcome = await performDocumentAction(documentId, () => onDocument(documentId), action);
      if (outcome === 'saved') setNotice(tr('library:savedToLibrary'));
      if (outcome === 'downloaded') setNotice(tr('library:downloadedCopy'));
      return outcome;
    } catch {
      failure();
    } finally {
      setOpening(undefined);
    }
  };
  const dueSoon = (overview?.upcoming ?? [])
    .filter(
      (d) =>
        !d.submitted && !d.orphaned &&
        Date.parse(d.dueAt) >= Date.now() &&
        Date.parse(d.dueAt) <= Date.now() + week,
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const updates = [...new Map([...homeDetails.flatMap(detail => detail.notifications), ...(overview?.otherNotifications ?? [])].map(item => [item.id,item])).values()];
  const unreadUpdates = updates.filter(item => !item.read).length;
  const availableTerms = termFilters.filter(filter => overview?.courses.some(course => matchesTerm(course,filter)) && (filter !== 'all' || new Set(overview.courses.map(course => course.identity.lifecycle)).size > 1));
  const selectedTerm = availableTerms.includes(term) ? term : availableTerms[0] ?? 'all';
  const sort = sortPreferences[selectedTerm] ?? (selectedTerm === 'current' ? 'smart' : 'name');
  const orderedCourses = useMemo(() => {
    if (!orderSnapshot) return [];
    const {data,now} = orderSnapshot;
    const notifications = [...new Map([...(data.summaries ?? []).flatMap(summary => summary.notifications),...(data.otherNotifications ?? [])].map(item => [item.id,item])).values()];
    return orderCourses(data.courses.map(course => {
      const attention = courseAttention(course.id,data.upcoming,notifications,now);
      return {id:course.id,course,name:displayTitle(course.identity,lang,course.fullName),term:course.identity.term,pinned:!!data.pinnedCourseIds?.includes(course.id),nextDueAt:attention.next ? Date.parse(attention.next.dueAt) : null,latestOverdueAt:attention.latestOverdueAt,overdueCount:attention.overdue,unreadCount:attention.unread};
    }),{now,locale:lang,sort,groupPins:selectedTerm === 'current' || selectedTerm === 'all',groupTerms:selectedTerm !== 'current'});
  },[orderSnapshot,sort,selectedTerm,lang]);
  const pinsVisible = selectedTerm === 'current' || selectedTerm === 'all';
  const orderKey = `${selectedTerm}:${orderedCourses.map(item => `${item.id}:${pinsVisible && item.pinned}`).join('|')}`;
  prepareMovement.current = useCourseMovement(pageRef,orderKey);
  const changeSort = async (value: string) => {
    if (value !== 'smart' && value !== 'name') return;
    try {await api.setSort(selectedTerm,value);prepareMovement.current();if(overview)setOrderSnapshot({data:overview,now:Date.now()});setSortPreferences(previous => ({...previous,[selectedTerm]:value as CourseSort}));} catch {failure();}
  };
  const pinCourse = async (accountId: string, id: string, pinned: boolean) => {
    setPinBusy(id);
    try {await api.setPinned(accountId,id,pinned);await refresh(true);} catch {failure();}
    finally {setPinBusy(undefined);}
  };
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
                title={tr("moodle:open_file", {name:f.name})}
                aria-label={tr("moodle:open_file", {name:f.name})}
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
              <Button variant="ghost" size="icon" aria-label={`${tr('webview:open')}: ${f.name}`} title={tr('webview:open')} onClick={() => openMoodle(detail!.course.accountId,{kind:'file',fileId:f.id})}><ArrowUpRight /></Button>
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
          </div>
          <div className="moodle-header-actions">
          {!courseId && <Button ref={updatesTrigger} variant="outline" className="updates-entry" onClick={() => setShowUpdates(true)}><Inbox />{tr("moodle:updates")}{unreadUpdates > 0 && <span className="updates-count">{unreadUpdates}</span>}</Button>}
          {detail && <Button ref={disconnectTrigger} variant="ghost" size="icon" aria-label={tr("moodle:disconnect")} title={tr("moodle:disconnect")} onClick={() => { disconnectSchool.current = overview?.accounts.find(account => account.id === detail.course.accountId)?.siteName; setConfirmDisconnect(detail.course.accountId); }}><Unplug /></Button>}
          <Button variant="outline" className="planner-entry" onClick={() => setShowPlanner(true)}><CalendarDays />{tr("planner:title")}</Button>
          <Button variant="outline" onClick={() => setConnect(true)}>
            <GraduationCap />
            {tr("moodle:connect_school")}
          </Button>
          </div>
        </header>
  );
  return (
    <main ref={pageRef} className="moodle-page" data-course={Boolean(detail)}>
      <div className="moodle-content">
        {!detail && !showUpdates && header}
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
        {!!overview?.accounts.length && !showUpdates && (!courseId || overview.accounts.some(account => account.status === "expired" || account.signInStorage)) && (
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
        {showUpdates && overview ? <UpdatesInbox
          items={updates}
          courses={overview.courses}
          onClose={() => {setShowUpdates(false);requestAnimationFrame(() => updatesTrigger.current?.focus());}}
          onOpen={item => {if (item.url) openMoodle(item.accountId,{kind:'page',url:item.url});}}
          onRead={async (items, read) => {
            try {for (const item of items) await api.markRead(item.id,read);} catch {failure();}
            await refresh().catch(() => setError(true));
          }}
        /> : loading ? (
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
                  <Button variant="outline" disabled={syncing} aria-busy={syncing} onClick={() => void sync()}><RefreshCw className={syncing ? "moodle-spin" : ""} />{tr("moodle:refresh")}</Button>
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
                      <TabsTrigger key={key} value={key} onFocus={event => event.currentTarget.scrollIntoView?.({block:"nearest",inline:"nearest"})}>
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
          <div className="courses-home-layout">
            <section className="courses-catalog" aria-labelledby="courses-title">
              <div className="moodle-section-heading moodle-grid-heading">
                <h2 id="courses-title">{tr("moodle:your_courses")}<span className="courses-total">{overview.courses.length}</span></h2>
              </div>
              <Tabs value={selectedTerm} onValueChange={value => {prepareMovement.current();setTerm(value as MoodleTermFilter);}} className="moodle-term-tabs">
                <div className="course-list-toolbar"><TabsList aria-label={tr("moodle:term_filter")}>
                  {availableTerms.map(filter => <TabsTrigger key={filter} value={filter}>{tr(`moodle:term_${filter}`)}<span className="moodle-chip">{overview.courses.filter(course => matchesTerm(course,filter)).length}</span></TabsTrigger>)}
                </TabsList><div className="course-list-controls"><Select value={sort} onValueChange={value => void changeSort(value)}><SelectTrigger className="course-sort" size="sm" aria-label={tr("moodle:sort_courses")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="smart">{tr("moodle:sort_smart")}</SelectItem><SelectItem value="name">{tr("moodle:sort_name")}</SelectItem></SelectContent></Select><CourseViewSwitch value={view} onChange={changeView} /></div></div>
                {termFilters.map(filter => <TabsContent key={filter} value={filter}>
                  {!overview.courses.some(course => matchesTerm(course,filter)) && <p className="moodle-empty-inline">{tr("moodle:no_term_courses")}</p>}
                  <div className="course-heading-row" aria-hidden="true">{[false,true].map(repeat => <div key={String(repeat)} className="course-column-headings" data-repeat={repeat}><span>{tr("moodle:overdue_column")}</span><span>{tr("moodle:unread_column")}</span></div>)}</div>
                  {pinsVisible && orderedCourses.some(item => item.pinned && matchesTerm(item.course,filter)) && <div className="course-group-label"><h3>{tr("moodle:pinned_courses")}</h3></div>}
                  <ul className="moodle-grid" data-view={view} role="list">
                    {orderedCourses.filter(item => matchesTerm(item.course,filter)).map(({course,pinned},index,items) => {
                      const attention = courseAttention(course.id, overview.upcoming, updates);
                      const name = displayTitle(course.identity,lang,course.fullName);
                      const teacher = displayTeachers(course.identity,lang);
                      const prefix = `course-${course.id}`;
                      const labels = [`${prefix}-title`, ...(teacher ? [`${prefix}-teacher`] : []), ...(attention.overdue ? [`${prefix}-overdue`] : []), ...(attention.unread ? [`${prefix}-unread`] : []), ...(attention.next ? [`${prefix}-deadline`] : [])];
                      const tooltip = [course.fullName, attention.overdue ? tr('moodle:course_overdue_tooltip',{count:attention.overdue}) : '', attention.unread ? tr('moodle:course_unread_tooltip',{count:attention.unread}) : ''].filter(Boolean).join('\n');
                      const urgent = !!attention.next && Date.parse(attention.next.dueAt)-Date.now()<86400000;
                      return <li key={course.id} className="moodle-course-card" title={course.fullName} data-course-id={course.id} data-pinned={pinned} data-group-start={pinsVisible && !pinned && index>0 && items[index-1]!.pinned}>
                        <div className="moodle-card-body">
                          <h3><button className="course-open" type="button" title={tooltip} aria-labelledby={labels.join(' ')} aria-describedby={`${prefix}-raw`} onClick={() => onCourse(course.id)}><span className="course-title" id={`${prefix}-title`}>{name}</span></button></h3>
                          {(teacher || attention.next) && <p className="course-meta">
                            {teacher && <span id={`${prefix}-teacher`}>{teacher}</span>}
                            {teacher && attention.next && <span className="course-meta-separator" aria-hidden="true">·</span>}
                            {attention.next && <time id={`${prefix}-deadline`} dateTime={attention.next.dueAt} title={attention.next.title} data-urgent={urgent}>{urgent && <Clock3 aria-hidden="true" />}{deadlinePhrase(attention.next.dueAt)}</time>}
                          </p>}
                        </div>
                        <div className="course-counts" aria-hidden="true">
                          <span className="course-count course-overdue" data-count={attention.overdue} title={attention.overdue ? tr('moodle:course_overdue_tooltip',{count:attention.overdue}) : undefined}>{attention.overdue>0 && <><AlarmClock />{attention.overdue>99 ? '99+' : attention.overdue}</>}</span>
                          <span className="course-count course-unread-count" data-count={attention.unread} title={attention.unread ? tr('moodle:course_unread_tooltip',{count:attention.unread}) : undefined}>{attention.unread>0 && <><Mail />{attention.unread>99 ? '99+' : attention.unread}</>}</span>
                        </div>
                        <button type="button" className="course-pin" aria-pressed={pinned} aria-label={tr(pinned ? 'moodle:unpin_course' : 'moodle:pin_course')} title={tr(pinned ? 'moodle:unpin_course' : 'moodle:pin_course')} aria-disabled={pinBusy === course.id} onClick={() => {if(!pinBusy)void pinCourse(course.accountId,course.id,!pinned);}}><Pin aria-hidden="true" /></button>
                        {attention.overdue>0 && <span id={`${prefix}-overdue`} className="sr-only">{tr('moodle:course_overdue',{count:attention.overdue})}</span>}
                        {attention.unread>0 && <span id={`${prefix}-unread`} className="sr-only">{tr('moodle:course_unread',{count:attention.unread})}</span>}
                        <span id={`${prefix}-raw`} className="sr-only">{course.fullName}{course.identity.lifecycle === 'unknown' && ` · ${tr('moodle:dates_unavailable')}`}</span>
                      </li>;

                    })}
                  </ul>
                </TabsContent>)}
              </Tabs>
            </section>
            <section className="moodle-due-section" aria-labelledby="due-title">
              <div className="moodle-section-heading">
                <h2 id="due-title"><Clock3 />{tr("moodle:due_soon")}<span className="courses-total">{dueSoon.length || ''}</span></h2>
                <span>{tr("moodle:next_seven_days")}</span>
              </div>
              {dueSoon.length ? <>
                <ul className="moodle-due-list">
                  {dueSoon.slice(0,allDue ? undefined : 5).map(d => {
                    const course = overview.courses.find(c => c.id === d.courseId);
                    return <li key={d.id} className="moodle-due-row" data-urgent={Date.parse(d.dueAt)-Date.now()<86400000}>
                      <span className="moodle-due-course" title={course?.fullName}>{course ? displayTitle(course.identity,lang,course.fullName) : tr("moodle:school")}</span>
                      <button className="moodle-due-link" title={d.title} onClick={() => onCourse(d.courseId)}>{d.title}</button>
                      <time dateTime={d.dueAt} title={date(d.dueAt)}>{relative(d.dueAt)}</time>
                      {remind(d)}
                    </li>;
                  })}
                </ul>
                {dueSoon.length>5 && <Button variant="ghost" className="due-show-all" aria-expanded={allDue} onClick={() => setAllDue(!allDue)}>{tr(allDue ? "moodle:show_less" : "moodle:show_all")}</Button>}
              </> : <p className="moodle-empty-inline">{tr("moodle:all_caught_up")}</p>}
            </section>
          </div>
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
        <Dialog open={!!confirmDisconnect} onOpenChange={open => { if (!open) setConfirmDisconnect(undefined); }}>
          <DialogContent onCloseAutoFocus={event => { event.preventDefault(); disconnectTrigger.current?.focus(); }}>
            <DialogHeader>
              <DialogTitle>{tr("moodle:disconnect_title", { school: disconnectSchool.current ?? tr("moodle:this_school") })}</DialogTitle>
              <DialogDescription asChild><div className="grid gap-2"><p>{tr("moodle:disconnect_removes")}</p><p>{tr("moodle:disconnect_keeps")}</p></div></DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDisconnect(undefined)}>{tr("common:cancel")}</Button>
              <Button variant="destructive" onClick={() => confirmDisconnect && void disconnect(confirmDisconnect)}>{tr("moodle:disconnect")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConnectDialog
          accounts={overview?.accounts}
          open={connect}
          onOpenChange={setConnect}
          api={api}
          onConnected={() => refresh(true)}
        />
      </div>
    </main>
  );
}
