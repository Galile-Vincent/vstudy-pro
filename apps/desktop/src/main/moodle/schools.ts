import type { MoodleSchool } from '../../shared/moodle';

export const schools: MoodleSchool[] = [
  { id: 'cycu', name: '中原大學 CYCU', host: 'https://ilearning.cycu.edu.tw', login: 'sso-launch' },
];
const identityHosts: Record<string, readonly string[]> = {
  cycu: ['login.microsoftonline.com', 'login.live.com', 'login.microsoft.com', 'fs.cycu.edu.tw', 'sso.cycu.edu.tw'],
};
export function schoolById(id: string): MoodleSchool {
  const school = schools.find(school => school.id === id);
  if (!school) throw new Error('Unknown Moodle school');
  return school;
}
export function allowsLoginNavigation(school: MoodleSchool, target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      [new URL(school.host).hostname, ...(identityHosts[school.id] ?? [])].includes(url.hostname);
  } catch { return false; }
}
