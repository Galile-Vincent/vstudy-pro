import type { MoodleCourse } from './moodle';
import type { MoodleTermFilter, MoodleCourseIdentity } from './moodle-course';

export function displayTitle(identity: MoodleCourseIdentity, language: string, raw = ''): string {
  const preferZh = /^(zh|ja)(-|$)/i.test(language);
  return (preferZh ? identity.title.zh || identity.title.en : identity.title.en || identity.title.zh) || raw;
}

function titleLanguage(identity: MoodleCourseIdentity, language: string): 'zh' | 'en' {
  const preferred = /^(zh|ja)(-|$)/i.test(language) ? 'zh' : 'en';
  return identity.title[preferred] ? preferred : preferred === 'zh' ? 'en' : 'zh';
}
export function displayTeachers(identity: MoodleCourseIdentity, language: string): string {
  const lang = titleLanguage(identity, language);
  return identity.teachers.map(teacher => teacher[lang] || teacher[lang === 'zh' ? 'en' : 'zh']).filter(Boolean).join(', ');
}
export function displayClass(identity: MoodleCourseIdentity): string {
  return identity.classLabel.zh || identity.classLabel.en || '';
}
export function matchesTerm(course: MoodleCourse, filter: MoodleTermFilter): boolean {
  return filter === 'all' || course.identity.lifecycle === filter || (filter === 'current' && course.identity.lifecycle === 'unknown' && !course.identity.term);
}
