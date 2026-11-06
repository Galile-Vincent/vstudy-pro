/** Deterministic course artwork. Only layout values and semantic token references enter CSS. */
import type { CSSProperties } from 'react';
import type { MoodleCourse } from '../../../shared/moodle';
import { tr } from '../../../shared/i18n';

import '../../shell/soft-art.css';

const colors = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

/** Stable artwork identity includes the term so repeated enrollments have a distinct cover. */
export function courseArt(id: string, term: string | null) {
  let hash = 2166136261;
  for (const character of `${id}:${term ?? ''}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return {
    style: {
      '--course-color': `var(${colors[hash % colors.length]})`,
      '--art-hue-offset': `${(hash >>> 12) % 71 - 35}`,
      '--art-hue-gap': `${30 + (hash >>> 20) % 21}`,
      '--art-x': `${20 + hash % 65}%`,
      '--art-y': `${10 + (hash >>> 8) % 60}%`,
    } as CSSProperties,
  };
}

/** Decorative fields only. Course-supplied images cannot add uncontrolled patterns. */
export function CourseArtwork({course}: {course: MoodleCourse}) {
  const art = courseArt(course.id, course.identity.term);
  return <div className="moodle-artwork soft-art" style={art.style} aria-hidden="true">
    <span className="moodle-art-scrim" />
  </div>;
}

/** Course cover shares the card's semantic code and completion labels with assistive technology. */
export function CourseCover({course, deadline}: {course: MoodleCourse; deadline?: {label:string; urgent:boolean}}) {
  return <div className="moodle-cover" style={courseArt(course.id, course.identity.term).style}>
    <CourseArtwork course={course} />
    {deadline && <span className="moodle-cover-due" data-urgent={deadline.urgent} title={deadline.label}>{deadline.label}</span>}
    <CourseProgress course={course} />
    <span className="moodle-course-code">{[course.identity.term, course.identity.code].filter(Boolean).join(' · ') || course.shortName}</span>
  </div>;
}

/** Completion is optional. Missing server progress never becomes a fabricated zero. */
export function CourseProgress({course}: {course: MoodleCourse}) {
  if (!course.identity.hasProgress || course.progress === null) return null;
  const count = Math.round(course.progress);
  return <div className="moodle-progress">
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle className="moodle-progress-track" cx="22" cy="22" r="18" /><circle className="moodle-progress-value" cx="22" cy="22" r="18" pathLength="100" strokeDasharray={`${count} 100`} /></svg>
    <span aria-hidden="true">{count}%</span>
    <progress className="sr-only" max={100} value={count} aria-label={tr('moodle:course_progress',{count})} />
  </div>;
}
