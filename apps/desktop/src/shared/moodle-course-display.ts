import type { MoodleCourseIdentity } from './moodle-course';

export function displayTitle(identity: MoodleCourseIdentity, language: string, raw = ''): string {
  const preferZh = /^(zh|ja)(-|$)/i.test(language);
  return (preferZh ? identity.title.zh || identity.title.en : identity.title.en || identity.title.zh) || raw;
}
