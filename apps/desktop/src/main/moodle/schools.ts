import type { MoodleSchool } from '../../shared/moodle';

const registry: (MoodleSchool & { identityHosts?: readonly string[] })[] = [
  { id: 'cycu', name: '中原大學 CYCU', host: 'https://ilearning.cycu.edu.tw', login: 'sso-launch', identityHosts: ['login.microsoftonline.com', 'login.live.com', 'login.microsoft.com', 'fs.cycu.edu.tw', 'sso.cycu.edu.tw'] },
];
export const schools: MoodleSchool[] = registry.map(({id,name,host,login}) => ({id,name,host,login}));
export function schoolById(id: string): MoodleSchool {
  const school = schools.find(school => school.id === id);
  if (!school) throw new Error('Unknown Moodle school');
  return school;
}
export function allowsLoginNavigation(school: MoodleSchool, target: string): boolean {
  try {
    const url = new URL(target);
    const identityHosts = registry.find(entry => entry.id === school.id)?.identityHosts ?? [];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      [new URL(school.host).hostname, ...identityHosts].includes(url.hostname);
  } catch { return false; }
}
