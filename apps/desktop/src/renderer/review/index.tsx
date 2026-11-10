import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, MoreHorizontal, RefreshCw } from "lucide-react";
import type { Conversation } from "../../shared/domain";
import type { IpcResponse } from "../../shared/ipc";
import { MAX_REVIEW_CONCEPTS } from "../../shared/review-artifacts";
import { tr } from "../../shared/i18n";
import { useFormat } from "../i18n";
import { desktop } from "../bridge";
import { useNavigate } from "../shell";
import {
  PageContainer,
  PageHeader,
  Toolbar,
  ListRow,
  Section,
  EmptyState,
} from "../components/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  Popover,
  Tab,
  TabList,
} from "@astryxdesign/core";
import { Select } from "../components/select";
import { useReviewPage, type Cursor } from "./paging";
import type { ReviewSelection } from "./review-selection";
import { ArtifactPanel } from "./artifacts";
import { MemoryConsentCard } from "./memory-consent";
import { useMoodleCourseSync } from "./moodle-courses";
import { useWeakConcepts, type WeakConcept } from "./weak";
import "./review.css";
type Course = IpcResponse<"review:courses:list">["items"][number];
function PageState({
  page,
  empty,
}: {
  page: {
    loading: boolean;
    error: boolean;
    items: unknown[];
    cursor: Cursor | null;
    retry: () => void;
    more: () => void;
  };
  empty?: { title: string; hint?: string; action?: ReactNode };
}) {
  return (
    <>
      {page.error && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button variant="secondary" label={tr("review:retry")} onClick={page.retry} />
        </p>
      )}
      {page.loading && <p role="status">{tr("review:loading")}</p>}
      {!page.loading && !page.error && !page.items.length && empty && (
        <EmptyState
          headingLevel={3}
          icon={<BookOpen aria-hidden="true" />}
          title={tr(`review:${empty.title}`)}
          {...(empty.hint ? { description: tr(`review:${empty.hint}`) } : {})}
          {...(empty.action ? { action: empty.action } : {})}
        />
      )}
      {page.cursor && (
        <Button variant="secondary" isDisabled={page.loading} label={tr("review:load_more")} onClick={page.more} />
      )}
    </>
  );
}
const LAST_COURSE = "vstudy-review-course";
const lastCourse = () => {
  try {
    return localStorage.getItem(LAST_COURSE) ?? "";
  } catch {
    return "";
  }
};
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
export function ReviewView() {
  useTranslation();
  const { navigate, route } = useNavigate();
  const [courseId, setCourseId] = useState(""),
    [userTab, setUserTab] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [actionError, setActionError] = useState(false),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [bounded, setBounded] = useState({ note: "", test: "" });
  const noteBounded = useCallback((message: string) => setBounded(old => ({ ...old, note: message })), []);
  const testBounded = useCallback((message: string) => setBounded(old => ({ ...old, test: message })), []);
  const courses = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:courses:list", {
          includeArchived: false,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [],
    ),
  );
  const course = courses.items.find((c) => c.id === courseId);
  const online = useOnline();
  const picked = useRef(false);
  const knownCourses = useRef<ReadonlySet<string>>(new Set());
  knownCourses.current = new Set(courses.items.map((c) => c.id));
  useMoodleCourseSync(() => knownCourses.current, courses.retry);
  const selectCourse = (id: string) => {
    picked.current = true;
    setCourseId(id);
    setUserTab(null);
    setSelection(null);
    try {
      localStorage.setItem(LAST_COURSE, id);
    } catch {
      /* The choice is only a convenience. */
    }
  };
  useEffect(() => {
    if (picked.current || courses.loading || !courses.items.length) return;
    const wanted =
      [route.courseId, lastCourse()].find(
        (id) => id && courses.items.some((c) => c.id === id),
      ) ?? courses.items[0]!.id;
    picked.current = true;
    setCourseId(wanted);
  }, [courses.loading, courses.items, route.courseId]);
  const weak = useWeakConcepts(courseId, revision);
  useEffect(() => {
    if (weak.loading || weak.error) return;
    setSelection(old => {
      if (!old || old.courseId !== courseId) return old;
      const remaining = old.conceptKeys.flatMap((key, i) =>
        weak.items.some(c => c.key === key) ? [{ key, label: old.labels[i]! }] : []);
      if (remaining.length === old.conceptKeys.length) return old;
      return { ...old, conceptKeys: remaining.map(c => c.key), labels: remaining.map(c => c.label) };
    });
  }, [weak.items, weak.loading, weak.error, courseId]);
  const tab =
    userTab ?? (weak.loading || weak.items.length ? "weak" : "recent");
  const failedAction = useRef<(() => Promise<unknown>) | null>(null);
  const pendingFocus = useRef<string[] | null>(null);
  const reload = () => setRevision((n) => n + 1);
  const mutate = async (action: () => Promise<unknown>, focus?: string[]) => {
    failedAction.current = action;
    setBusy(true);
    setActionError(false);
    try {
      await action();
      pendingFocus.current = focus ?? null;
      reload();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const ids = pendingFocus.current;
    if (!ids || busy || weak.loading) return;
    const el = ids
      .map((id) => document.getElementById(id))
      .find(Boolean);
    if (el && el.closest("[hidden]")) {
      return;
    }
    pendingFocus.current = null;
    el?.focus();
  }, [revision, busy, weak.loading, weak.items, tab, selection]);
  const open = (conversationId: string, messageId?: string) =>
    navigate({
      view: "history",
      conversationId: conversationId as Conversation["id"],
      messageId,
    });
  const artifacts = (
    kind: "note" | "test",
    keys: string[],
    labels: string[],
    totalConcepts?: number,
  ) => {
    setSelection({
      courseId,
      conceptKeys: keys,
      labels,
      ...(totalConcepts !== undefined ? { totalConcepts } : {}),
    });
    pendingFocus.current = [`review-${kind}-heading`];
    setUserTab(kind === "note" ? "notes" : "tests");
  };
  const emptyCourses =
    !courses.loading && !courses.error && !courses.items.length;
  return (
    <PageContainer as="main" className="review-page">
      <PageHeader
        title={tr("review:title")}
        description={tr("review:subtitle")}
        actions={
          <Button
            variant="ghost"
            isIconOnly
            label={tr("review:retry")}
            icon={<RefreshCw size={16} />}
            onClick={() => {
              courses.retry();
              weak.retry();
              reload();
            }}
          />
        }
      />

      <p className="review-announcement" role="status" aria-live="polite" aria-atomic="true">{tab === "notes" ? bounded.note : tab === "tests" ? bounded.test : ""}</p>
      <MemoryConsentCard />
      {!online && <p role="status">{tr("review:offline")}</p>}
      <Toolbar
        left={
          <Select
            aria-label={tr("review:course_picker")}
            value={courseId}
            onChange={(e) => selectCourse(e.target.value)}
          >
            <option value="">{tr("review:unsorted")}</option>
            {courses.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        }
      />
      <PageState page={courses} />
      <CourseTools
        course={course}
        open={emptyCourses}
        refresh={() => {
          courses.retry();
          reload();
        }}
        onCreated={selectCourse}
      />
      {actionError && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button
            variant="secondary"
            label={tr("review:retry")}
            onClick={() => {
              if (failedAction.current) void mutate(failedAction.current);
            }}
          />
        </p>
      )}
      {!courseId ? (
        <Inbox key={revision} courses={courses.items} open={open} />
      ) : (
        <div className="flex flex-col gap-[var(--space-4)]">
          <TabList
            role="tablist"
            value={tab}
            onChange={setUserTab}
            aria-label={tr("review:title")}
          >
            {(["recent", "weak", "notes", "tests"] as const).map((t) => (
              <Tab
                key={t}
                id={`tab-${t}`}
                value={t}
                label={tr(`review:${t}`)}
                panelId={`panel-${t}`}
                onFocus={() => setUserTab(t)}
                onMouseDown={() => setUserTab(t)}
              />
            ))}
          </TabList>
          <div
            role="tabpanel"
            id="panel-recent"
            aria-labelledby="tab-recent"
            aria-label={tr("review:recent")}
            hidden={tab !== "recent"}
          >
            {tab === "recent" && (
              <Recent
                key={courseId + revision}
                course={course}
                courseId={courseId}
                open={open}
                mutate={mutate}
                busy={busy}
              />
            )}
          </div>
          <div
            role="tabpanel"
            id="panel-weak"
            aria-labelledby="tab-weak"
            aria-label={tr("review:weak")}
            hidden={tab !== "weak"}
          >
            {tab === "weak" && (
              <Weak
                key={courseId}
                weak={weak}
                open={open}
                mutate={mutate}
                busy={busy}
                artifacts={artifacts}
                showRecent={() => setUserTab("recent")}
              />
            )}
          </div>
          <div
            role="tabpanel"
            id="panel-notes"
            aria-labelledby="tab-notes"
            aria-label={tr("review:notes")}
            hidden={tab !== "notes"}
          >
            <ArtifactPanel
              key={courseId + "note"}
              courseId={courseId}
              revision={revision}
              onBoundedChange={noteBounded}
              kind="note"
              selection={selection}
            />
          </div>
          <div
            role="tabpanel"
            id="panel-tests"
            aria-labelledby="tab-tests"
            aria-label={tr("review:tests")}
            hidden={tab !== "tests"}
          >
            <ArtifactPanel
              key={courseId + "test"}
              courseId={courseId}
              revision={revision}
              onBoundedChange={testBounded}
              kind="test"
              selection={selection}
              onConfirmed={() => { pendingFocus.current = ["review-test-heading"]; reload(); }}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
function CourseTools({
  course,
  open,
  refresh,
  onCreated,
}: {
  course: Course | undefined;
  open: boolean;
  refresh: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [moodle, setMoodle] = useState<IpcResponse<"moodle:overview"> | null>(null);
  const failedAction = useRef<(() => Promise<unknown>) | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    failedAction.current = action;
    setBusy(true);
    setFailed(false);
    try {
      await action();
      refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="review-tools" open={open || undefined}>
      <summary>{tr("review:manage_courses")}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const c = await desktop.invoke("review:courses:create", {
              title: title.trim(),
              aliases: [],
            });
            setTitle("");
            onCreated(c.id);
          });
        }}
      >
        <label>
          {tr("review:course_title")}
          <input
            value={title}
            maxLength={240}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <Button variant="secondary" isDisabled={busy || !title.trim()} type="submit" label={tr("review:create_course")} />
      </form>
      {course && (
        <>
          <Button
            variant="secondary"
            isDisabled={busy}
            label={tr("review:archive")}
            onClick={() =>
              void run(() =>
                desktop
                  .invoke("review:courses:archive", {
                    courseId: course.id,
                    archived: true,
                  })
                  .then(() => onCreated("")),
              )
            }
          />
          <Button
            variant="secondary"
            isDisabled={busy}
            label={tr("review:link_moodle")}
            onClick={() =>
              void run(async () =>
                setMoodle(await desktop.invoke("moodle:overview", {})),
              )
            }
          />
          {moodle && (
            <Select
              aria-label={tr("review:link_moodle")}
              value={course.moodleCourseId ?? ""}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  desktop.invoke("review:courses:link-moodle", {
                    courseId: course.id,
                    moodleCourseId: e.target.value || null,
                  }),
                )
              }
            >
              <option value="">{tr("review:unlinked")}</option>
              {moodle.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button
            variant="secondary"
            label={tr("review:retry")}
            onClick={() => {
              if (failedAction.current) void run(failedAction.current);
            }}
          />
        </p>
      )}
    </details>
  );
}
function Inbox({
  courses,
  open,
}: {
  courses: Course[];
  open: (id: string) => void;
}) {
  const { navigate } = useNavigate();
  const page = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:chat:inbox", {
          limit: 20,
          ...(cursor ? { cursor } : {}),
        }),
      [],
    ),
  );
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      page.retry();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>{tr("review:unsorted")}</h2>
      <p>{tr("review:inbox_help")}</p>
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button
            variant="secondary"
            label={tr("review:retry")}
            onClick={() => {
              setFailed(false);
              page.retry();
            }}
          />
        </p>
      )}
      <ul className="review-list">
        {page.items.map((link, i) => (
          <li key={link.conversationId}>
            <Button
              variant="ghost"
              label={tr("review:chat_number", { number: i + 1 })}
              onClick={() => open(link.conversationId)}
            />
            <Select
              aria-label={tr("review:move")}
              value=""
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  desktop.invoke("review:chat:assign", {
                    conversationId: link.conversationId,
                    courseId: e.target.value,
                  }),
                )
              }
            >
              <option value="">{tr("review:move")}</option>
              {courses.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              isDisabled={busy}
              label={tr(
                link.excludeFromMemory
                  ? "review:include_chat"
                  : "review:exclude_chat",
              )}
              onClick={() =>
                void run(() =>
                  desktop.invoke("review:chat:exclude", {
                    conversationId: link.conversationId,
                    excluded: !link.excludeFromMemory,
                  }),
                )
              }
            />
          </li>
        ))}
      </ul>
      <PageState
        page={page}
        empty={{
          title: "inbox_empty",
          hint: "inbox_empty_hint",
          action: <Button variant="secondary" label={tr("review:ask_question")} onClick={() => navigate("home")} />,
        }}
      />
    </section>
  );
}
type Mutate = (
  action: () => Promise<unknown>,
  focus?: string[],
) => Promise<void>;
function Recent({
  course,
  courseId,
  open,
  mutate,
  busy,
}: {
  course: Course | undefined;
  courseId: string;
  open: (id: string, messageId: string) => void;
  mutate: Mutate;
  busy: boolean;
}) {
  const { navigate } = useNavigate();
  const page = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:jobs:page", {
          courseId,
          limit: 20,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  const units = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:courses:units", {
          courseId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  const observations = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:observations:page", {
          courseId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  const [edit, setEdit] = useState<string | null>(null),
    [text, setText] = useState("");
  const format = useFormat();
  const paused = page.items.filter((job) => job.errorCode === "budget");
  return (
    <section>
      <h2 id="review-recent-heading" tabIndex={-1}>
        {tr("review:recent")}
      </h2>
      {paused.length > 0 && (
        <p role="status">
          {tr("review:budget")}{" "}
          <Button
            variant="secondary"
            isDisabled={busy}
            label={tr("review:retry")}
            onClick={() =>
              void mutate(async () => {
                for (const job of paused)
                  await desktop.invoke("review:jobs:retry", { jobId: job.id });
              }, ["review-recent-heading"])
            }
          />
        </p>
      )}
      <p>{tr("review:recent_help")}</p>
      <ol className="review-list">
        {page.items.map((job) => (
          <li key={job.id}>
            <time dateTime={job.occurredAt}>
              {format.date(job.occurredAt)}
            </time>
            <span className="review-chip">
              {course?.title ?? tr("review:unsorted")}
            </span>
            {[
              ...new Set(
                observations.items
                  .filter((o) => o.jobId === job.id)
                  .map((o) => o.unitId),
              ),
            ].map((id) => {
              const unit = units.items.find((u) => u.id === id);
              return unit ? (
                <span className="review-chip" key={unit.id}>
                  {unit.title}
                </span>
              ) : null;
            })}
            {edit === job.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(async () => {
                    await desktop.invoke("review:jobs:edit", {
                      jobId: job.id,
                      changes: { questionSummary: text },
                    });
                    setEdit(null);
                  });
                }}
              >
                <label>
                  {tr("review:summary")}
                  <input
                    autoFocus
                    value={text}
                    maxLength={240}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <Button variant="secondary" type="submit" isDisabled={busy || !text.trim()} label={tr("review:save")} />
                <Button variant="secondary" type="button" label={tr("review:cancel")} onClick={() => setEdit(null)} />
              </form>
            ) : (
              <Button
                variant="ghost"
                className="review-question"
                label={job.questionSummary ?? tr("review:pending")}
                onClick={() => open(job.conversationId, job.userMessageId)}
              />
            )}
            <div className="review-actions">
              <Button
                variant="secondary"
                isDisabled={busy}
                label={tr("review:edit")}
                onClick={() => {
                  setEdit(job.id);
                  setText(job.questionSummary ?? "");
                }}
              />
              <Button
                variant="secondary"
                isDisabled={busy}
                label={tr("review:exclude_chat")}
                onClick={() =>
                  void mutate(
                    () =>
                      desktop.invoke("review:chat:exclude", {
                        conversationId: job.conversationId,
                        excluded: true,
                      }),
                    ["review-recent-heading"],
                  )
                }
              />
              {job.status !== "succeeded" && (
                <span>
                  {tr(`review:job_${job.status}`)}
                  {job.status === "failed" && (
                    <Button
                      variant="secondary"
                      isDisabled={busy}
                      label={tr("review:retry")}
                      onClick={() =>
                        void mutate(() =>
                          desktop.invoke("review:jobs:retry", {
                            jobId: job.id,
                          }),
                        )
                      }
                    />
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      <PageState
        page={page}
        empty={{
          title: "recent_empty",
          hint: "recent_empty_hint",
          action: <Button variant="secondary" label={tr("review:ask_question")} onClick={() => navigate("home")} />,
        }}
      />
      <details>
        <summary>{tr("review:related_units")}</summary>
        <PageState page={units} />
        <PageState page={observations} />
      </details>
    </section>
  );
}
function Weak({
  weak,
  open,
  mutate,
  busy,
  artifacts,
  showRecent,
}: {
  showRecent: () => void;
  weak: {
    items: WeakConcept[];
    loading: boolean;
    error: boolean;
    retry: () => void;
  };
  open: (id: string, messageId: string) => void;
  mutate: Mutate;
  busy: boolean;
  artifacts: (
    kind: "note" | "test",
    keys: string[],
    labels: string[],
    totalConcepts?: number,
  ) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [label, setLabel] = useState("");
  const renameInput = useRef<HTMLInputElement>(null);
  const finishRename = (id: string) => {
    setEditing(null);
    document.getElementById(`weak-menu-${id}`)?.focus();
  };
  const items = weak.items;
  const neighbour = (index: number) => {
    const other = items[index + 1] ?? items[index - 1];
    return [...(other ? [`weak-${other.id}`] : []), "review-weak-heading"];
  };
  const remove = (index: number, action: () => Promise<unknown>) =>
    void mutate(action, neighbour(index));
  return (
    <Section title={<span id="review-weak-heading" tabIndex={-1}>{tr("review:needs_review")}</span>}
      actions={
        <Button
          variant="primary"
          isDisabled={!items.length}
          label={tr("review:today")}
          onClick={() =>
            artifacts(
              "test",
              items.slice(0, MAX_REVIEW_CONCEPTS).map((c) => c.key),
              items.slice(0, MAX_REVIEW_CONCEPTS).map((c) => c.label),
              items.length,
            )
          }
        />
      }
    >
      <p>{tr("review:weak_help")}</p>
      <Popover
        label={tr("review:why")}
        content={<p>{tr("review:evidence_rule")}</p>}
      >
        <Button variant="ghost" className="review-help" label={tr("review:why")} />
      </Popover>
      <ul className="review-list">
        {items.map((c, index) => (
          <li key={c.id} id={`weak-${c.id}`} tabIndex={-1}>
            <ListRow
              title={
                <span role="heading" aria-level={3}>
                  {c.label}
                </span>
              }
              actions={
                <div className="review-actions">
                  <Evidence courseId={c.courseId} conceptKey={c.key} open={open} />
                  <Button variant="secondary" label={tr("review:make_test")} onClick={() => artifacts("test", [c.key], [c.label])} />
                  <Button
                    variant="ghost"
                    isDisabled={busy}
                    label={tr("review:understood")}
                    onClick={() =>
                      remove(index, () =>
                        desktop.invoke("review:concepts:understood", {
                          conceptId: c.id,
                        }),
                      )
                    }
                  />
                  <DropdownMenu
                    alignment="end"
                    renderTrigger={(triggerProps) => (
                      <Button
                        {...triggerProps}
                        variant="ghost"
                        isIconOnly
                        id={`weak-menu-${c.id}`}
                        label={tr("review:row_actions", {
                          concept: c.label,
                        })}
                        icon={<MoreHorizontal size={16} />}
                      />
                    )}
                  >
                    <DropdownMenuItem
                      label={tr("review:make_note")}
                      onClick={() => {
                        artifacts("note", [c.key], [c.label]);
                        setTimeout(() => document.getElementById("review-note-heading")?.focus(), 0);
                      }}
                    />
                    <DropdownMenuItem
                      label={tr("review:rename")}
                      onClick={() => {
                        setEditing(c.id);
                        setLabel(c.label);
                        setTimeout(() => renameInput.current?.focus(), 0);
                      }}
                    />
                    <DropdownMenuItem
                      label={tr("review:dismiss")}
                      isDisabled={busy}
                      onClick={() =>
                        remove(index, () =>
                          desktop.invoke("review:concepts:dismiss", {
                            conceptId: c.id,
                          }),
                        )
                      }
                    />
                  </DropdownMenu>
                </div>
              }
            />
            {editing === c.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(async () => {
                    await desktop.invoke("review:concepts:edit", {
                      conceptId: c.id,
                      changes: { label },
                    });
                    setEditing(null);
                  }, [`weak-menu-${c.id}`]);
                }}
              >
                <label>
                  {tr("review:rename")}
                  <input
                    autoFocus
                    ref={renameInput}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") finishRename(c.id);
                    }}
                    maxLength={240}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <Button variant="secondary" isDisabled={busy || !label.trim()} type="submit" label={tr("review:save")} />
                <Button variant="secondary" type="button" label={tr("review:cancel")} onClick={() => finishRename(c.id)} />
              </form>
            )}
          </li>
        ))}
      </ul>
      {weak.loading && <p role="status">{tr("review:loading")}</p>}
      {weak.error && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button variant="secondary" label={tr("review:retry")} onClick={weak.retry} />
        </p>
      )}
      {!weak.loading && !weak.error && !items.length && (
        <EmptyState
          headingLevel={3}
          icon={<BookOpen aria-hidden="true" />}
          title={tr("review:weak_empty")}
          description={tr("review:weak_empty_hint")}
          action={<Button variant="secondary" label={tr("review:show_recent")} onClick={showRecent} />}
        />
      )}
    </Section>
  );
}
function Evidence({
  courseId,
  conceptKey,
  open,
}: {
  courseId: string;
  conceptKey: string;
  open: (id: string, messageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="review-evidence" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>{tr("review:evidence")}</summary>
      {expanded && (
        <EvidencePage courseId={courseId} conceptKey={conceptKey} open={open} />
      )}
    </details>
  );
}
function EvidencePage({
  courseId,
  conceptKey,
  open,
}: {
  courseId: string;
  conceptKey: string;
  open: (id: string, messageId: string) => void;
}) {
  const page = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:observations:page", {
          courseId,
          limit: 20,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  return (
    <>
      <ul>
        {page.items
          .filter((o) => o.conceptKey === conceptKey)
          .map((o) => (
            <li key={o.id}>
              <p>{o.weaknessNote}</p>
              <blockquote>{o.evidenceQuote}</blockquote>
              <Button variant="secondary" label={tr("review:open_evidence")} onClick={() => open(o.conversationId, o.userMessageId)} />
            </li>
          ))}
      </ul>
      {!page.loading && !page.error && !page.items.length && <p>{tr("review:evidence_empty")}</p>}
      <PageState page={page} />
    </>
  );
}
