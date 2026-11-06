import { schools } from '../moodle/schools';
export function resolveSchool(verifiedSiteUrl:string) {
  const school=schools.find(school=>school.host === verifiedSiteUrl);
  return school ? {id:school.id,name:school.name} : null;
}
