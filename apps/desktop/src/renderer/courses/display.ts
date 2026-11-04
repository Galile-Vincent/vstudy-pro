import type { MoodleCourseIdentity, MoodleTermFilter } from '../../shared/moodle-course';
import type { MoodleCourse } from '../../shared/moodle';

type Localized = MoodleCourseIdentity['title'];
function localized(value: Localized, lang: string) {
  return (lang.startsWith('en') ? value.en || value.zh : value.zh || value.en) || '';
}
export function displayTitle(identity: MoodleCourseIdentity, lang: string, raw = '') {
  return localized(identity.title, lang) || raw;
}
export function displayTeachers(identity: MoodleCourseIdentity, lang: string) {
  return identity.teachers.map(teacher => localized(teacher, lang)).filter(Boolean).join(', ');
}
export function displayClass(identity: MoodleCourseIdentity, lang: string) {
  return localized(identity.classLabel, lang);
}
export function matchesTerm(course: MoodleCourse, filter: MoodleTermFilter) {
  return filter === 'all' || course.identity.lifecycle === filter ||
    (filter === 'current' && course.identity.lifecycle === 'unknown' && !course.identity.term);
}
