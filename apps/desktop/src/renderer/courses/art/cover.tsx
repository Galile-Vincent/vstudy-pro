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
      '--art-hue-offset': `${(hash >>> 12) % 161 - 80}`,
      '--art-hue-gap': `${40 + (hash >>> 20) % 51}`,
      '--art-lightness': `${.64 + (hash >>> 16) % 12 / 100}`,
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
    <svg className="moodle-art-pattern" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{[0,1,2,3,4].map(index => <ellipse key={index} cx="360" cy="120" rx={85 + index * 44} ry={150 + index * 50} />)}</svg><span className="moodle-art-grain" /><span className="moodle-art-scrim" />
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
