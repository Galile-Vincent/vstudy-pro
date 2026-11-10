import { flushSync } from 'react-dom';
import { catalogDeadlines } from './deadline-groups';
import { performDocumentAction, type DocumentAction } from '../document-open';
import { documentIdSchema } from '../../shared/domain';
import { Card, PageContainer, PageHeader, Section, ListRow, Toolbar, EmptyState, SegmentedTabsList, SegmentedTabsTrigger } from "../components/ui";
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
import { useNavigate, useOptionalNavigation } from "../shell";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsContent,
} from "../components/ui/tabs";
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
import "./courses.css";
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
import { CourseHead } from "./course-head";
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

export function CoursesView() {
  const api = useMoodleApi();
  const { route, navigate } = useNavigate();
  return (
    <Courses
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
  const navigation = useOptionalNavigation();
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollFades(pageRef);
  const [showUpdates, setShowUpdates] = useState(false);
  const [allDue, setAllDue] = useState(false);
  const updatesTrigger = useRef<HTMLButtonElement>(null);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const disconnectTrigger = useRef<HTMLButtonElement>(null);
  const disconnectSchool = useRef<string | undefined>(undefined);
  const [showPlanner, setShowPlanner] = useState(false);
  const plannerTrigger = useRef<HTMLButtonElement>(null);
  const plannerBack = useRef<HTMLButtonElement>(null);
  const plannerWasOpen = useRef(false);
  useEffect(() => {
    if (showPlanner) plannerBack.current?.focus();
    else if (plannerWasOpen.current) plannerTrigger.current?.focus();
    plannerWasOpen.current = showPlanner;
  }, [showPlanner]);
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
  const [weekState, setWeekState] = useState<{
    courseId: string;
    open: Set<string>;
    current: string;
  }>({courseId: "", open: new Set(), current: ""});
  const currentWeeks = detail?.sections.filter(section => section.current) ?? [];
  const currentWeekKey = JSON.stringify(currentWeeks.map(section => section.id));
  if (detail && (weekState.courseId !== detail.course.id || weekState.current !== currentWeekKey)) {
    setWeekState({
      courseId: detail.course.id,
      current: currentWeekKey,
      open: new Set([
        ...(weekState.courseId === detail.course.id ? weekState.open : []),
        ...currentWeeks.map(section => section.id),
      ]),
    });
  }
  const setWeekOpen = (id: string, open: boolean) => setWeekState(previous => {
    const weeks = new Set(previous.open);
    if (open) weeks.add(id); else weeks.delete(id);
    return {...previous, open: weeks};
  });
  const [tab, setTab] = useState<Tab>("content");
  const [term, setTerm] = useState<MoodleTermFilter>("current");
  const termInitialized = useRef(false);
  useEffect(() => {
    if (!overview || termInitialized.current) return;
    if (!overview.courses.length &&
      (syncing || overview.accounts.some(account => !account.syncedAt))) return;
    termInitialized.current = true;
    setTerm(termFilters.find(filter =>
      overview.courses.some(course => matchesTerm(course, filter)),
    ) ?? 'current');
  }, [overview, syncing]);
  const lang = i18n.resolvedLanguage || "en";
  const [opening, setOpening] = useState<string>();
  const [agentRequest, setAgentRequest] = useState(0);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async (reorder = false, immediate = false) => {
    const sequence = ++refreshSequence.current;
    const [next, course] = await Promise.all([
      api.overview(),
      courseId && !immediate ? api.course(courseId) : Promise.resolve(undefined),
    ]);
    const summaries = next.summaries ?? [];
    if (sequence !== refreshSequence.current) return;
    const update = () => {
      if (reorder) {prepareMovement.current();setOrderSnapshot({data:next,now:Date.now()});}
      setOverview(next);
      setDetail(course);
      setHomeDetails(summaries);
    };
    if (immediate) flushSync(update);
    else update();
    return next;
  }, [api, courseId]);
  useEffect(() => {
    let current = true;
    setLoading(!!courseId || !overview);
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
    else if (event.state === 'idle' && event.completed === event.total) setError(false);
    reorder ||= event.state === 'idle' && event.completed === event.total;
    if (!timer) timer=setTimeout(() => {timer=undefined;const completed=reorder;reorder=false;void refresh(completed).catch(() => setError(true));},50);
    });
    return () => {clearTimeout(timer);unsubscribe?.();};
  },[api,courseId,refresh]);

  const panelStatus = (...names:import('../../shared/moodle').MoodlePanel[]) => {
    const states=names.map(name => detail?.panels?.[name]);
    const retained = names.some(name => name === 'contents' || name === 'completion' ? !!detail?.sections.length : name === 'teachers' ? !!detail?.course.identity.teachers.length : name === 'assignments' || name === 'quizzes' ? !!detail?.deadlines.length : !!detail?.[name].length);
    return <>
      {states.includes('loading') && <EmptyState
        role="status" aria-busy="true" headingLevel={2}
        title={tr("moodle:loading")} className={retained ? "py-2" : undefined}
      />}
      {states.includes('error') && <EmptyState role="alert" headingLevel={2}
        title={tr(`moodle:panel_error_${names.map(name => detail?.panelErrors?.[name]).find(Boolean) ?? "service"}`)}
        action={<Button onClick={() => void sync()}>{tr("moodle:retry")}</Button>}
      />}
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
      const next = await refresh(true, true);
      if (courseId) flushSync(() => onCourse());
      const target = !next?.accounts.length ? connectTrigger.current
        : pageRef.current?.querySelector(courseId ? 'h2' : 'h1');
      if (target instanceof HTMLElement) {
        if (target !== connectTrigger.current) target.tabIndex = -1;
        target.focus();
      }
    } catch {
      failure();
      disconnectTrigger.current?.focus();
    }
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
  const { overdue, dueSoon, undated } = catalogDeadlines(
    overview?.upcoming ?? [], Date.now(),
  );
  const updates = [...new Map([...homeDetails.flatMap(detail => detail.notifications), ...(overview?.otherNotifications ?? [])].map(item => [item.id,item])).values()];
  const unreadUpdates = updates.filter(item => !item.read).length;
  const availableTerms = termFilters;
  const selectedTerm = term;
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
      onChange={async () => { await refresh(); }}
      onError={failure}
    />
  );
  const deadlines = (items: MoodleDeadline[], headingLevel: 3 | 4 = 3) =>
    items.length ? (
      <div className="moodle-rows">
        {items.map((d) => (
          <ListRow key={d.id} data-deadline-group={deadlineGroup(d)}
            title={d.title}
            leading={d.submitted ? <Check /> : <CalendarDays />}
            subtitle={<>
              <span>{tr(`moodle:${d.kind}`)}</span>
              <time className="ms-2" dateTime={d.dueAt}>{date(d.dueAt)}</time>
              {d.submitted === null && <span className="moodle-chip">{tr("moodle:submission_unknown")}</span>}
              {d.submitted && <span className="moodle-chip">{tr("moodle:submitted")}</span>}
            </>}
            meta={<span data-overdue={!d.submitted && Date.parse(d.dueAt) < Date.now()}>
              {d.submitted ? tr("moodle:done") : relative(d.dueAt)}
            </span>}
            actions={<div className="flex flex-wrap items-center gap-2">
            {d.url && <Button variant="ghost" aria-label={tr('moodle:open_deadline', {title: d.title})} onClick={() => {
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
            </div>}
          />
        ))}
      </div>
    ) : (
      <EmptyState headingLevel={headingLevel} title={tr("moodle:no_deadlines")} />
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
          <ListRow key={n.id} data-unread={!n.read}
            className="flex-col items-stretch [&>.ui-row-target]:w-full"
            title={<span className="flex items-center gap-2">
              {!n.read && <span className="moodle-unread" role="img" aria-label={tr("moodle:unread")} />}
              {n.subject}
            </span>}
            subtitle={<span className="line-clamp-2">{plainText(n.body)}</span>}
            meta={<time dateTime={n.createdAt}>{relative(n.createdAt)}</time>}
            actions={<div className="flex flex-wrap gap-2">
              {n.url && <Button variant="ghost" aria-label={tr("moodle:open_notification", {title: n.subject})} onClick={() => openMoodle(n.accountId,{kind:'page',url:n.url!})}>{tr('webview:open')}<ArrowUpRight /></Button>}
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
            </div>}
          />
        ))}
      </div>
    ) : (
      <EmptyState title={tr("moodle:no_notifications")} />
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
              <ListRow key={f.id}
                className="moodle-file-actions"
                title={tr("moodle:open_file", {name: f.name})}
                leading={<FileText />}
                subtitle={<span>
                  {" "}{new Intl.NumberFormat(i18n.resolvedLanguage, {
                    style: "unit", unit: "megabyte", maximumFractionDigits: 1,
                  }).format(f.size / 1000000)}
                  <span className="ms-2">{" "}{f.module}</span>
                </span>}
                disabled={!!opening}
                onClick={() => void openFile(f.id)}
                meta={<span>{" "}{tr(opening === f.id ? "moodle:converting" : f.documentId ? "moodle:ready" : "moodle:not_opened")}</span>}
                actions={
              <Button variant="ghost" size="icon" aria-label={tr("moodle:open_original_file", {title: f.name})} title={tr('webview:open')} onClick={() => openMoodle(detail!.course.accountId,{kind:'file',fileId:f.id})}><ArrowUpRight /></Button>
                }
              />
            ))}
        </section>
      ))
    ) : (
      <EmptyState title={tr("moodle:no_files")} />
    );
  };
  if (showPlanner) return <PageContainer as="main" className="h-full overflow-auto">
    <Button variant="ghost" ref={plannerBack} className="moodle-back" onClick={() => setShowPlanner(false)}><ArrowLeft />{tr("planner:back")}</Button>
    <Planner courses={overview?.courses ?? []} deadlines={overview?.upcoming ?? []} />
  </PageContainer>;
  const header = (
    <PageHeader title={!courseId ? tr("moodle:courses") : loading ? <span role="status">{tr("moodle:loading")}</span> : undefined}
      actions={<div className="flex flex-wrap gap-2 [&_button]:min-h-9 [&_button]:h-auto">
        {!courseId && <Button ref={updatesTrigger} variant="outline" className="updates-entry"
          onClick={() => setShowUpdates(true)}>
          <Inbox />{tr("moodle:updates")}{unreadUpdates > 0 && <span>{unreadUpdates}</span>}
        </Button>}
        <Button ref={plannerTrigger} variant="outline" className="planner-entry"
          onClick={() => setShowPlanner(true)}><CalendarDays />{tr("planner:title")}</Button>
        {overview && !overview.accounts.length && <Button ref={connectTrigger} variant="outline" onClick={() => setConnect(true)}>
          <GraduationCap />{tr("moodle:connect_school")}
        </Button>}
      </div>} />
  );
  return (
    <div ref={pageRef} className={courseId ? "moodle-page" : "h-full overflow-auto text-[var(--ink)] [&_svg]:size-4 [&_button]:cursor-pointer [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-[var(--focus)]"} data-course={Boolean(detail)}>
      <PageContainer as="main" className={courseId ? "pt-0" : undefined}>
        {!detail && !showUpdates && header}
        {(notice || courseId) && <div role="status" aria-live="polite">
          {notice && (
            <div className="moodle-banner">
              {notice}
              <Button variant="ghost" onClick={() => setNotice("")}>
                {tr("moodle:dismiss")}
              </Button>
            </div>
          )}
        </div>}
        {error && (
          <div className={courseId ? "moodle-banner" : "flex flex-wrap items-center gap-3"} role="alert">
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
            <Button variant="ghost" onClick={() => setError(false)}>{tr("moodle:dismiss")}</Button>
          </div>
        )}
        {!!overview?.accounts.length && !showUpdates && (!courseId || overview.accounts.some(account => account.status === "expired" || account.signInStorage)) && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setConnect(true)}>
                <GraduationCap />{tr("moodle:connect_another_school")}
              </Button>
              <Button variant="ghost" disabled={syncing} onClick={() => void sync()}>
                <RefreshCw className={syncing ? "moodle-spin" : ""} />
                {tr(courseId ? "moodle:refresh_this_course" : "moodle:refresh_all_schools")}
              </Button>
            </div>
            {overview.accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center gap-2">
                <ListRow className="min-w-0 flex-[1_1_100%] min-[1200px]:flex-[1_1_12rem] [&_.ui-row-target]:break-words" title={account.displayName}
                  subtitle={`${account.siteName} · ${new URL(account.siteUrl).host}`} />
                <small>
                  {account.syncedAt
                    ? tr("moodle:synced", { time: relative(account.syncedAt) })
                    : tr("moodle:not_synced")}
                </small>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tr("moodle:disconnect_school_named", { school: account.siteName })}
                  onClick={event => {
                    disconnectTrigger.current = event.currentTarget;
                    disconnectSchool.current = account.siteName;
                    setConfirmDisconnect(account.id);
                  }}
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
                    <Button ref={connectTrigger} variant="outline" onClick={() => setConnect(true)}>
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
          <div aria-busy="true">{!courseId && <p role="status">{tr("moodle:loading")}</p>}</div>
        ) : courseId ? (
          detail ? (
            <>
              <CourseHead
                title={displayTitle(detail.course.identity, lang, detail.course.fullName)}
                chip={[detail.course.identity.term, detail.course.identity.code].filter(Boolean).join(" · ")}
                people={[displayTeachers(detail.course.identity, lang), displayClass(detail.course.identity, lang)].filter(Boolean)}
                sync={tr('storage:cached_'+(detail.cacheState ?? 'stale')) + ' · ' + (detail.lastSyncedAt ? tr('storage:last_synced',{time:relative(detail.lastSyncedAt)}) : tr('storage:never_synced'))}
                fullName={detail.course.fullName}
                syncing={syncing}
                menuTrigger={disconnectTrigger}
                onBack={() => onCourse()}
                onOpen={() => {
                  const account = overview?.accounts.find(a => a.id === detail.course.accountId);
                  if (account) openMoodle(account.id,{kind:'page',url:account.siteUrl + '/course/view.php?id=' + detail.course.remoteId});
                }}
                onRefresh={() => void sync()}
                onDisconnect={() => { disconnectSchool.current = overview?.accounts.find(account => account.id === detail.course.accountId)?.siteName; setConfirmDisconnect(detail.course.accountId); }}
              />
              <div className="moodle-course-layout">
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as Tab)}
                  className="moodle-tabs"
                >
                  <SegmentedTabsList
                    aria-label={tr("moodle:course_sections")}
                  >
                    {tabs.map((key) => (
                      <SegmentedTabsTrigger key={key} value={key} data-text={tr(`moodle:${key}`)} onFocus={event => event.currentTarget.scrollIntoView?.({block:"nearest",inline:"nearest"})}>
                        {tr(`moodle:${key}`)}
                      </SegmentedTabsTrigger>
                    ))}
                  </SegmentedTabsList>
                  <TabsContent value="content">
                    <div className="grid items-start gap-6 mb-6 min-[1280px]:grid-cols-2">
                      <Section title={tr("moodle:up_next")} actions={
                          <Button
                            variant="ghost"
                            onClick={() => setTab("deadlines")}
                          >
                            {tr("moodle:view_all")}
                            <ChevronRight />
                          </Button>
                        }>
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
                      </Section>
                      <Section title={tr("moodle:latest_updates")}>
                        {notifications(3)}
                      </Section>
                    </div>
                    {panelStatus('contents','completion','teachers')}
                    {detail.contentsPartial && <p role="status">{tr('moodle:contents_partial')}</p>}
                    <CourseContent
                      detail={detail}
                      openWeeks={weekState.open}
                      setWeekOpen={setWeekOpen}
                      openFile={openFile}
                      onError={failure}
                    />
                  </TabsContent>
                  <TabsContent value="deadlines" aria-busy={detail.fetchState === "loading"}>
                    {panelStatus('assignments','quizzes')}
                    <section className="flex min-w-0 flex-col gap-4">
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
                              4,
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
                    <section className="flex min-w-0 flex-col gap-4">
                      <h2>{tr("moodle:notifications")}</h2>
                      {notifications()}
                    </section>
                  </TabsContent>
                  <TabsContent value="grades" aria-busy={detail.fetchState === "loading"}>
                    {panelStatus('grades')}
                    <section className="flex min-w-0 flex-col gap-4">
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
                        <EmptyState title={tr("moodle:no_grades")} />
                      )}
                    </section>
                  </TabsContent>
                  <TabsContent value="files">
                    <section className="flex min-w-0 flex-col gap-4">
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
                  onChange={async () => { await refresh(); }}
                  onError={failure}
                />
              </div>
            </>
          ) : (
            <div>
              <PageHeader title={tr("moodle:course_unavailable")} />
              <EmptyState headingLevel={2} title={tr("moodle:course_unavailable")} action={
              <Button variant="outline" onClick={() => onCourse()}>
                {tr("moodle:all_courses")}
              </Button>} />
            </div>
          )
        ) : overview && (overview.courses.length > 0 || overview.accounts.some(account => account.syncedAt)) ? (
          <div className="flex min-w-0 flex-col gap-6">
    <Section title={tr("moodle:your_courses")} count={overview.courses.length}>
      <Tabs
        value={selectedTerm}
        onValueChange={(value) => {
          prepareMovement.current();
          termInitialized.current = true;
          setTerm(value as MoodleTermFilter);
        }}
        className="moodle-term-tabs"
      >
        <Toolbar
          left={
            <SegmentedTabsList aria-label={tr("moodle:term_filter")}>
              {availableTerms.map((filter) => (
                <SegmentedTabsTrigger key={filter} value={filter}>
                  {tr(`moodle:term_${filter}`)}
                  <span className="moodle-chip">
                    {overview.courses.filter((course) => matchesTerm(course, filter)).length}
                  </span>
                </SegmentedTabsTrigger>
              ))}
            </SegmentedTabsList>
          }
          right={
            <>
              <Select value={sort} onValueChange={(value) => void changeSort(value)}>
                <SelectTrigger
                  className="course-sort"
                  size="sm"
                  aria-label={tr("moodle:sort_courses")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">{tr("moodle:sort_smart")}</SelectItem>
                  <SelectItem value="name">{tr("moodle:sort_name")}</SelectItem>
                </SelectContent>
              </Select>
              <CourseViewSwitch value={view} onChange={changeView} />
            </>
          }
        />
        {termFilters.map((filter) => (
          <TabsContent key={filter} value={filter}>
            {!overview.courses.some((course) => matchesTerm(course, filter)) && (
              <EmptyState title={tr("moodle:no_term_courses")} />
            )}
            {pinsVisible &&
              orderedCourses.some((item) => item.pinned && matchesTerm(item.course, filter)) && (
                <div className="course-group-label py-2 text-sm text-[var(--muted)]">
                  <h3>{tr("moodle:pinned_courses")}</h3>
                </div>
              )}
            <ul
              className={
                view === "cards"
                  ? "moodle-grid grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-3 p-0 list-none"
                  : "moodle-grid flex flex-col p-0 list-none"
              }
              data-view={view}
              role="list"
            >
              {orderedCourses
                .filter((item) => matchesTerm(item.course, filter))
                .map(({ course, pinned }, index, items) => {
                  const attention = courseAttention(course.id, overview.upcoming, updates);
                  const name = displayTitle(course.identity, lang, course.fullName);
                  const teacher = displayTeachers(course.identity, lang);
                  const prefix = `course-${course.id}`;
                  const labels = [
                    `${prefix}-title`,
                    ...(teacher ? [`${prefix}-teacher`] : []),
                    ...(attention.overdue ? [`${prefix}-overdue`] : []),
                    ...(attention.unread ? [`${prefix}-unread`] : []),
                    ...(attention.next ? [`${prefix}-deadline`] : []),
                  ];
                  const tooltip = [
                    course.fullName,
                    attention.overdue
                      ? tr("moodle:course_overdue_tooltip", { count: attention.overdue })
                      : "",
                    attention.unread
                      ? tr("moodle:course_unread_tooltip", { count: attention.unread })
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n");
                  const Surface = view === "cards" ? Card : "div";
                  const urgent =
                    !!attention.next && Date.parse(attention.next.dueAt) - Date.now() < 86400000;
                  return (
                    <li
                      key={course.id}
                      className="moodle-course-card min-w-0"
                      title={course.fullName}
                      data-course-id={course.id}
                      data-pinned={pinned}
                      data-group-start={
                        pinsVisible && !pinned && index > 0 && items[index - 1]!.pinned
                      }
                    >
                      <Surface
                        {...(view === "cards" ? { variant: "flat" as const } : {})}
                        className="py-0"
                      >
                        <ListRow
                          className="w-full min-h-14 flex-wrap gap-3 [&>.ui-row-target]:min-w-[min(100%,14rem)]"
                          title={
                            <button
                              className="course-open block w-full text-start whitespace-normal break-words"
                              type="button"
                              title={tooltip}
                              aria-labelledby={labels.join(" ")}
                              aria-describedby={`${prefix}-raw`}
                              onAuxClick={(event) => {
                                if (event.button === 1) {
                                  event.preventDefault();
                                  navigation?.openTab({
                                    view: "courses",
                                    courseId: course.id,
                                    title: name,
                                  });
                                }
                              }}
                              onClick={(event) =>
                                event.metaKey || event.ctrlKey
                                  ? navigation?.openTab({
                                      view: "courses",
                                      courseId: course.id,
                                      title: name,
                                    })
                                  : onCourse(course.id)
                              }
                            >
                              <span className="course-title" id={`${prefix}-title`}>
                                {name}
                              </span>
                            </button>
                          }
                          subtitle={
                            (teacher || attention.next) && (
                              <span className="course-meta flex flex-wrap items-baseline gap-x-2 text-sm">
                                {teacher && <span id={`${prefix}-teacher`}>{teacher}</span>}
                                {teacher && attention.next && (
                                  <span className="course-meta-separator" aria-hidden="true">
                                    ·
                                  </span>
                                )}
                                {attention.next && (
                                  <time
                                    id={`${prefix}-deadline`}
                                    dateTime={attention.next.dueAt}
                                    title={attention.next.title}
                                    data-urgent={urgent}
                                  >
                                    {urgent && <Clock3 aria-hidden="true" className="me-1 inline align-middle" />}
                                    {deadlinePhrase(attention.next.dueAt)}
                                  </time>
                                )}
                              </span>
                            )
                          }
                          actions={
                            <div className="flex items-center gap-1">
                              {navigation?.openTab && <Button
                                variant="ghost"
                                size="icon"
                                className="relative z-1"
                                aria-label={tr("moodle:open_course_tab", { course: name })}
                                title={tr("moodle:open_course_tab", { course: name })}
                                onClick={() =>
                                  navigation?.openTab({
                                    view: "courses",
                                    courseId: course.id,
                                    title: name,
                                  })
                                }
                              >
                                <ArrowUpRight aria-hidden="true" />
                              </Button>}
                              <div
                                className="course-counts flex items-center gap-2"
                                aria-hidden="true"
                              >
                                <span
                                  className="course-count course-overdue w-[calc(var(--space-4)*3.5)] shrink-0 inline-flex items-center gap-1 text-[var(--danger)]"
                                  data-count={attention.overdue}
                                  title={
                                    attention.overdue
                                      ? tr("moodle:course_overdue_tooltip", {
                                          count: attention.overdue,
                                        })
                                      : undefined
                                  }
                                >
                                  {attention.overdue > 0 && (
                                    <>
                                      <AlarmClock />
                                      {attention.overdue > 99 ? "99+" : attention.overdue}
                                    </>
                                  )}
                                </span>
                                <span
                                  className="course-count course-unread-count w-[calc(var(--space-4)*3.5)] shrink-0 inline-flex items-center gap-1 text-[var(--muted)]"
                                  data-count={attention.unread}
                                  title={
                                    attention.unread
                                      ? tr("moodle:course_unread_tooltip", {
                                          count: attention.unread,
                                        })
                                      : undefined
                                  }
                                >
                                  {attention.unread > 0 && (
                                    <>
                                      <Mail />
                                      {attention.unread > 99 ? "99+" : attention.unread}
                                    </>
                                  )}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="course-pin grid size-[calc(var(--space-3)*3)] shrink-0 place-items-center rounded-[var(--r-sm)] aria-pressed:bg-[var(--active)]"
                                aria-pressed={pinned}
                                aria-label={tr(
                                  pinned ? "moodle:unpin_course_named" : "moodle:pin_course_named",
                                  { course: name },
                                )}
                                aria-disabled={pinBusy === course.id}
                                onClick={() => {
                                  if (!pinBusy)
                                    void pinCourse(course.accountId, course.id, !pinned);
                                }}
                              >
                                <Pin aria-hidden="true" fill={pinned ? "currentColor" : "none"} />
                              </button>
                              {attention.overdue > 0 && (
                                <span id={`${prefix}-overdue`} className="sr-only">
                                  {tr("moodle:course_overdue", { count: attention.overdue })}
                                </span>
                              )}
                              {attention.unread > 0 && (
                                <span id={`${prefix}-unread`} className="sr-only">
                                  {tr("moodle:course_unread", { count: attention.unread })}
                                </span>
                              )}
                              <span id={`${prefix}-raw`} className="sr-only">
                                {course.fullName}
                                {course.identity.lifecycle === "unknown" &&
                                  ` · ${tr("moodle:dates_unavailable")}`}
                              </span>
                            </div>
                          }
                        />
                      </Surface>
                    </li>
                  );
                })}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
    <Section title={tr("moodle:due_soon")} count={overdue.length + dueSoon.length + undated.length}>
      {([overdue, dueSoon, undated] as const).map(
        (items, group) =>
          items.length > 0 && (
            <section key={group} className="flex flex-col gap-4">
              <h3 className="font-medium">
                {tr(group === 0 ? "moodle:overdue_column" : group === 1 ? "moodle:next_seven_days" : "moodle:no_due_date")}
              </h3>
              <ul className="moodle-due-list list-none p-0">
                {items.slice(0, allDue ? undefined : 5).map((d) => {
                  const course = overview.courses.find((c) => c.id === d.courseId);
                  return (
                    <li key={d.id}>
                      <ListRow
                        className="min-h-16"
                        title={
                          <button
                            className="moodle-due-link text-start"
                            onClick={() => onCourse(d.courseId)}
                          >
                            {d.title}
                          </button>
                        }
                        subtitle={
                          course
                            ? displayTitle(course.identity, lang, course.fullName)
                            : tr("moodle:school")
                        }
                        meta={group !== 2 &&
                          <time dateTime={d.dueAt} title={date(d.dueAt)}>
                            {relative(d.dueAt)}
                          </time>
                        }
                        actions={group !== 2 && remind(d)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}
      {!error && overdue.length + dueSoon.length + undated.length === 0 && <p className="text-[var(--muted)]">{tr("moodle:all_caught_up")}</p>}
      {Math.max(overdue.length, dueSoon.length, undated.length) > 5 && (
        <Button variant="ghost" aria-expanded={allDue} onClick={() => setAllDue(!allDue)}>
          {tr(allDue ? "moodle:show_less" : "moodle:show_all")}
        </Button>
      )}
    </Section>
  </div>
        ) : (
          !error && (
            <EmptyState headingLevel={2} icon={<GraduationCap />} title={tr(
              overview?.accounts.length
                ? overview.accounts.some(account => !account.syncedAt)
                  ? "moodle:syncing" : "moodle:no_courses"
                : "moodle:empty_title",
            )} description={!overview?.accounts.length ? tr("moodle:empty_description") : undefined} />
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
          onConnected={async () => { await refresh(true); }}
        />
      </PageContainer>
    </div>
  );
}
