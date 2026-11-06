/** Deterministic course artwork. Only layout values and semantic token references enter CSS. */
import { useState, type CSSProperties } from 'react';
import type { MoodleCourse } from '../../../shared/moodle';
import { tr } from '../../../shared/i18n';

const colors = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;
const patterns = ['orbits', 'contours', 'waves', 'grid'] as const;

/** Stable artwork identity includes the term so repeated enrollments have a distinct cover. */
export function courseArt(id: string, term: string | null) {
  let hash = 2166136261;
  for (const character of `${id}:${term ?? ''}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return {
    pattern: patterns[hash % patterns.length]!,
    style: {
      '--course-color': `var(${colors[hash % colors.length]})`,
      '--art-angle': `${hash % 180 + 80}deg`,
      '--art-x': `${20 + hash % 65}%`,
      '--art-y': `${10 + (hash >>> 8) % 60}%`,
    } as CSSProperties,
  };
}

/** Decorative generated or remote cover. A failed remote image leaves the generated artwork visible. */
export function CourseArtwork({course}: {course: MoodleCourse}) {
  const art = courseArt(course.id, course.identity.term);
  const [failedImage, setFailedImage] = useState<string>();
  return <div className="moodle-artwork" data-pattern={art.pattern} style={art.style} aria-hidden="true">
    {course.imageUrl && failedImage !== course.imageUrl && <img src={course.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage(course.imageUrl!)} />}
    <span className="moodle-art-pattern" /><span className="moodle-art-grain" /><span className="moodle-art-scrim" />
  </div>;
}

/** Course cover shares the card's semantic code and completion labels with assistive technology. */
export function CourseCover({course}: {course: MoodleCourse}) {
  return <div className="moodle-cover" style={courseArt(course.id, course.identity.term).style}>
    <CourseArtwork course={course} />
    <span className="moodle-course-code">{[course.identity.term, course.identity.code].filter(Boolean).join(' · ') || course.shortName}</span>
  </div>;
}

/** Completion is optional. Missing server progress never becomes a fabricated zero. */
export function CourseProgress({course}: {course: MoodleCourse}) {
  if (!course.identity.hasProgress || course.progress === null) return null;
  const count = Math.round(course.progress);
  return <div className="moodle-progress" style={courseArt(course.id, course.identity.term).style}>
    <progress max={100} value={count} aria-label={tr('moodle:course_progress',{count})} />
    <span>{tr('moodle:course_progress',{count})}</span>
  </div>;
}
