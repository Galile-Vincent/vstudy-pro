import { Card, IconButton } from '@astryxdesign/core';
import { AlarmClock, ArrowUpRight, Clock3, Mail, Pin } from 'lucide-react';
import { ListRow } from '../components/ui';
import { useOptionalNavigation } from '../shell';
import { tr } from '../../shared/i18n';
import { displayTitle, displayTeachers } from '../../shared/moodle-course-display';
import type { MoodleCourse } from '../../shared/moodle';
import type { CourseViewMode } from './view-mode';
import type { courseAttention } from './attention';

export function CourseLibraryRow({course, pinned, attention, lang, view, groupStart, busy, tabIndex, onFocus, onPin, onCourse, deadlinePhrase}: {
  course: MoodleCourse;
  pinned: boolean;
  attention: ReturnType<typeof courseAttention>;
  lang: string;
  view: CourseViewMode;
  groupStart: boolean;
  busy: boolean;
  tabIndex: number;
  onFocus: () => void;
  onPin: () => void;
  onCourse: (id: string) => void;
  deadlinePhrase: (value: string) => string;
}) {
  const navigation = useOptionalNavigation();
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
      className="moodle-course-card min-w-0"
      title={course.fullName}
      data-course-id={course.id}
      data-pinned={pinned}
      data-group-start={
        groupStart
      }
    >
      <Surface
        {...(view === "cards" ? { elevation:"none" as const } : {})}
        className="py-0"
      >
        <ListRow
          className="course-library-row"
          title={
            <button
              className="course-open block w-full text-start whitespace-normal break-words"
              type="button"
              tabIndex={tabIndex}
              onFocus={onFocus}
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
              <div
                className="course-counts flex items-center gap-3 pe-2"
                aria-hidden="true"
              >
                <span
                  className="course-count course-overdue shrink-0 inline-flex items-center gap-1 text-[var(--danger)]"
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
                  className="course-count course-unread-count shrink-0 inline-flex items-center gap-1 text-[var(--muted)]"
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
              {navigation?.openTab && <IconButton label={tr("moodle:open_course_tab", { course: name })}
                tabIndex={tabIndex}
                onFocus={onFocus}
                variant="ghost"
                 size="md"
                className="relative z-1"
                aria-label={tr("moodle:open_course_tab", { course: name })}
                {...{title:tr("moodle:open_course_tab", { course: name })}}
                onClick={() =>
                  navigation?.openTab({
                    view: "courses",
                    courseId: course.id,
                    title: name,
                  })
                } icon={<ArrowUpRight aria-hidden="true" />} />}
              <button
                type="button"
                className="course-pin grid size-[calc(var(--space-3)*3)] shrink-0 place-items-center rounded-[var(--radius-element)] aria-pressed:bg-[var(--active)]"
                tabIndex={tabIndex}
                onFocus={onFocus}
                aria-pressed={pinned}
                aria-label={tr(
                  pinned ? "moodle:unpin_course_named" : "moodle:pin_course_named",
                  { course: name },
                )}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) onPin();
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
}
