/**
 * Choose localized course titles and display labels from normalized identity metadata.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import type { MoodleCourse } from './moodle';
import type { MoodleTermFilter, MoodleCourseIdentity } from './moodle-course';

/** Choose the preferred localized course title with an available-text fallback. */
export function displayTitle(identity: MoodleCourseIdentity, language: string, raw = ''): string {
  const preferZh = /^(zh|ja)(-|$)/i.test(language);
  return cleanCourseTitle((preferZh ? identity.title.zh || identity.title.en : identity.title.en || identity.title.zh) || raw, identity);
}

function cleanCourseTitle(value: string, identity: Pick<MoodleCourseIdentity, 'term' | 'teachers'>): string {
  let title = value.trim();
  let matchedTeacher = false;
  for (const teacher of identity.teachers.flatMap(teacher => [teacher.zh,teacher.en]).filter((teacher): teacher is string => !!teacher)) {
    const escaped = teacher.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g,'\\s+');
    const suffix = new RegExp(`\\s*[-\\u2013\\u2014]\\s*${escaped}\\s*$`,'iu');
    const candidate = title.replace(suffix,'').trim();
    if (candidate && candidate !== title) {title = candidate;matchedTeacher = true;}
  }
  if (identity.term) {
    const prefix = new RegExp(`^${identity.term}(?:\\s+|\\s*[-_:：]\\s*)`,'u');
    title = title.replace(prefix,'').trim();
    if (matchedTeacher && title.startsWith(identity.term)) title = title.slice(identity.term.length).trim();
  }
  return title || value;
}

function titleLanguage(identity: MoodleCourseIdentity, language: string): 'zh' | 'en' {
  const preferred = /^(zh|ja)(-|$)/i.test(language) ? 'zh' : 'en';
  return identity.title[preferred] ? preferred : preferred === 'zh' ? 'en' : 'zh';
}
/** Choose normalized teacher labels for course display. */
export function displayTeachers(identity: MoodleCourseIdentity, language: string): string {
  const lang = titleLanguage(identity, language);
  return identity.teachers.map(teacher => teacher[lang] || teacher[lang === 'zh' ? 'en' : 'zh']).filter(Boolean).join(', ');
}
/** Choose the course class label without exposing raw multilingual markup. */
export function displayClass(identity: MoodleCourseIdentity): string {
  return identity.classLabel.zh || identity.classLabel.en || '';
}
/** Include courses according to the requested lifecycle filter and unknown-term policy. */
export function matchesTerm(course: MoodleCourse, filter: MoodleTermFilter): boolean {
  return filter === 'all' || course.identity.lifecycle === filter || (filter === 'current' && course.identity.lifecycle === 'unknown' && !course.identity.term);
}
