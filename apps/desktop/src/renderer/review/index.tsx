import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, MoreHorizontal, RefreshCw } from "lucide-react";
import type { Conversation } from "../../shared/domain";
import type { IpcResponse } from "../../shared/ipc";
import { MAX_REVIEW_CONCEPTS } from "../../shared/review-artifacts";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { useNavigate } from "../shell";
import {
  PageContainer,
  PageHeader,
  Toolbar,
  ListRow,
  EmptyState,
} from "../components/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Tabs,
  SegmentedTabsList,
  SegmentedTabsTrigger,
  TabsContent,
} from "../components/ui/segmented-tabs";
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
  empty?: string;
}) {
  return (
    <>
      {page.error && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button onClick={page.retry}>{tr("review:retry")}</Button>
        </p>
      )}
      {page.loading && <p role="status">{tr("review:loading")}</p>}
      {!page.loading && !page.error && !page.items.length && empty && (
        <EmptyState
          headingLevel={2}
          icon={<BookOpen aria-hidden="true" />}
          title={tr(`review:${empty}`)}
          action={<Button onClick={page.retry}>{tr("review:retry")}</Button>}
        />
      )}
      {page.cursor && (
        <Button disabled={page.loading} onClick={page.more}>
          {tr("review:load_more")}
        </Button>
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
    pendingFocus.current = null;
    ids
      .map((id) => document.getElementById(id))
      .find(Boolean)
      ?.focus();
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
            aria-label={tr("review:retry")}
            onClick={() => {
              courses.retry();
              weak.retry();
              reload();
            }}
          >
            <RefreshCw size={16} />
          </Button>
        }
      />

      <MemoryConsentCard />
      {!online && <p role="status">{tr("review:offline")}</p>}
      <Toolbar
        left={
          <label>
            {tr("review:course_picker")}
            <select
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
            </select>
          </label>
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
            onClick={() => {
              if (failedAction.current) void mutate(failedAction.current);
            }}
          >
            {tr("review:retry")}
          </Button>
        </p>
      )}
      {!courseId ? (
        <Inbox key={revision} courses={courses.items} open={open} />
      ) : (
        <Tabs value={tab} onValueChange={setUserTab}>
          <SegmentedTabsList aria-label={tr("review:title")}>
            {["recent", "weak", "notes", "tests"].map((t) => (
              <SegmentedTabsTrigger
                key={t}
                value={t}
                className="whitespace-normal text-start"
              >
                {tr(`review:${t}`)}
              </SegmentedTabsTrigger>
            ))}
          </SegmentedTabsList>
          <TabsContent value="recent">
            <Recent
              key={courseId + revision}
              course={course}
              courseId={courseId}
              open={open}
              mutate={mutate}
              busy={busy}
            />
          </TabsContent>
          <TabsContent value="weak">
            <Weak
              key={courseId}
              weak={weak}
              open={open}
              mutate={mutate}
              busy={busy}
              artifacts={artifacts}
            />
          </TabsContent>
          <TabsContent value="notes" forceMount hidden={tab !== "notes"}>
            <ArtifactPanel
              key={courseId + "note"}
              courseId={courseId}
              kind="note"
              selection={selection}
            />
          </TabsContent>
          <TabsContent value="tests" forceMount hidden={tab !== "tests"}>
            <ArtifactPanel
              key={courseId + "test"}
              courseId={courseId}
              kind="test"
              selection={selection}
              onConfirmed={reload}
            />
          </TabsContent>
        </Tabs>
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
        <Button disabled={busy || !title.trim()} type="submit">
          {tr("review:create_course")}
        </Button>
      </form>
      {course && (
        <>
          <Button
            disabled={busy}
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
          >
            {tr("review:archive")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setMoodle(await desktop.invoke("moodle:overview", {})),
              )
            }
          >
            {tr("review:link_moodle")}
          </Button>
          {moodle && (
            <label>
              {tr("review:link_moodle")}
              <select
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
              </select>
            </label>
          )}
        </>
      )}
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button
            onClick={() => {
              if (failedAction.current) void run(failedAction.current);
            }}
          >
            {tr("review:retry")}
          </Button>
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
            onClick={() => {
              setFailed(false);
              page.retry();
            }}
          >
            {tr("review:retry")}
          </Button>
        </p>
      )}
      <ul className="review-list">
        {page.items.map((link, i) => (
          <li key={link.conversationId}>
            <Button variant="ghost" onClick={() => open(link.conversationId)}>
              {tr("review:chat_number", { number: i + 1 })}
            </Button>
            <label>
              {tr("review:move")}
              <select
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
                <option value="">{tr("review:course_picker")}</option>
                {courses.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                void run(() =>
                  desktop.invoke("review:chat:exclude", {
                    conversationId: link.conversationId,
                    excluded: !link.excludeFromMemory,
                  }),
                )
              }
            >
              {tr(
                link.excludeFromMemory
                  ? "review:include_chat"
                  : "review:exclude_chat",
              )}
            </Button>
          </li>
        ))}
      </ul>
      <PageState page={page} empty="inbox_empty" />
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
            disabled={busy}
            onClick={() =>
              void mutate(async () => {
                for (const job of paused)
                  await desktop.invoke("review:jobs:retry", { jobId: job.id });
              }, ["review-recent-heading"])
            }
          >
            {tr("review:retry")}
          </Button>
        </p>
      )}
      <p>{tr("review:recent_help")}</p>
      <ol className="review-list">
        {page.items.map((job) => (
          <li key={job.id}>
            <time dateTime={job.occurredAt}>
              {new Date(job.occurredAt).toLocaleDateString(
                document.documentElement.lang || "en",
              )}
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
                <Button type="submit" disabled={busy || !text.trim()}>
                  {tr("review:save")}
                </Button>
                <Button type="button" onClick={() => setEdit(null)}>
                  {tr("review:cancel")}
                </Button>
              </form>
            ) : (
              <Button
                variant="ghost"
                className="review-question"
                onClick={() => open(job.conversationId, job.userMessageId)}
              >
                {job.questionSummary ?? tr("review:pending")}
              </Button>
            )}
            <div className="review-actions">
              <Button
                disabled={busy}
                onClick={() => {
                  setEdit(job.id);
                  setText(job.questionSummary ?? "");
                }}
              >
                {tr("review:edit")}
              </Button>
              <Button
                disabled={busy}
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
              >
                {tr("review:exclude_chat")}
              </Button>
              {job.status !== "succeeded" && (
                <span>
                  {tr(`review:job_${job.status}`)}
                  {job.status === "failed" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void mutate(() =>
                          desktop.invoke("review:jobs:retry", {
                            jobId: job.id,
                          }),
                        )
                      }
                    >
                      {tr("review:retry")}
                    </Button>
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      <PageState page={page} empty="recent_empty" />
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
}: {
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
  const renameTarget = useRef<string | null>(null);
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
    <section>
      <div className="review-section-heading">
        <div>
          <h2 id="review-weak-heading" tabIndex={-1}>
            {tr("review:needs_review")}
          </h2>
          <p>{tr("review:weak_help")}</p>
        </div>
        <Button
          disabled={!items.length}
          onClick={() =>
            artifacts(
              "test",
              items.slice(0, MAX_REVIEW_CONCEPTS).map((c) => c.key),
              items.slice(0, MAX_REVIEW_CONCEPTS).map((c) => c.label),
              items.length,
            )
          }
        >
          {tr("review:today")}
        </Button>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="review-help">
            {tr("review:why")}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>{tr("review:evidence_rule")}</p>
        </PopoverContent>
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
                  <Button onClick={() => artifacts("note", [c.key], [c.label])}>
                    {tr("review:make_note")}
                  </Button>
                  <Button onClick={() => artifacts("test", [c.key], [c.label])}>
                    {tr("review:make_test")}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      remove(index, () =>
                        desktop.invoke("review:concepts:understood", {
                          conceptId: c.id,
                        }),
                      )
                    }
                  >
                    {tr("review:understood")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        id={`weak-menu-${c.id}`}
                        aria-label={tr("review:row_actions", {
                          concept: c.label,
                        })}
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
                      if (renameTarget.current === c.id) {
                        event.preventDefault();
                        renameTarget.current = null;
                        renameInput.current?.focus();
                      }
                    }}>
                      <DropdownMenuItem
                        onSelect={() => {
                          renameTarget.current = c.id;
                          setEditing(c.id);
                          setLabel(c.label);
                        }}
                      >
                        {tr("review:rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() =>
                          remove(index, () =>
                            desktop.invoke("review:concepts:dismiss", {
                              conceptId: c.id,
                            }),
                          )
                        }
                      >
                        {tr("review:dismiss")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
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
                <Button disabled={busy || !label.trim()} type="submit">
                  {tr("review:save")}
                </Button>
                <Button type="button" onClick={() => finishRename(c.id)}>
                  {tr("review:cancel")}
                </Button>
              </form>
            )}
            <Evidence courseId={c.courseId} conceptKey={c.key} open={open} />
          </li>
        ))}
      </ul>
      {weak.loading && <p role="status">{tr("review:loading")}</p>}
      {weak.error && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button onClick={weak.retry}>{tr("review:retry")}</Button>
        </p>
      )}
      {!weak.loading && !weak.error && !items.length && (
        <EmptyState
          headingLevel={2}
          icon={<BookOpen aria-hidden="true" />}
          title={tr("review:weak_empty")}
        />
      )}
    </section>
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
    <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
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
              <Button onClick={() => open(o.conversationId, o.userMessageId)}>
                {tr("review:open_evidence")}
              </Button>
            </li>
          ))}
      </ul>
      <PageState page={page} empty="evidence_empty" />
    </>
  );
}
