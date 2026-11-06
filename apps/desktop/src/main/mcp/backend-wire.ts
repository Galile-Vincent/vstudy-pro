/** Parse supported Moodle 3.x to 5.x fields, preserving unknown safety states as unknown. @packageDocumentation */
import { z } from 'zod';
import { fail } from './backend-errors';

export const numeric = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform(Number).pipe(z.number().finite());
export const integer = numeric.pipe(z.number().int().safe());
export const flag = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')]).transform(value => value === true || value === 1 || value === '1');
export const warnings = z.array(z.unknown()).max(1000);
export function noWarnings(value: {warnings?:unknown[] | undefined} | unknown[]): void {
  if ((Array.isArray(value) ? value : value.warnings ?? []).length) fail('UNSUPPORTED');
}
export function timestamp(value:number | null | undefined): string | null {
  if (!value || value <= 0 || value > 253402300799) return null;
  return new Date(value * 1000).toISOString();
}
export const cmWire = z.object({cm:z.object({
  id:integer, course:integer, modname:z.string(), instance:integer,
  completion:integer.optional(), completiongradeitemnumber:integer.nullable().optional(), completionpassgrade:flag.optional(),
  visible:flag.optional(), completionview:flag.optional(), grade:numeric.optional(), gradepass:numeric.optional(), score:numeric.optional(),
  advancedgrading:z.array(z.unknown()).optional(),
}).passthrough(), warnings:warnings.optional()});
export const forumsWire = z.array(z.object({id:integer, course:integer, cmid:integer.optional(), name:z.string(), type:z.string().optional(), intro:z.string().optional()})).max(1000);
export const discussionsWire = z.object({discussions:z.array(z.object({
  id:integer, discussion:integer.optional(), forum:integer.optional(), forumid:integer.optional(),
  name:z.string().optional(), subject:z.string().optional(), userfullname:z.string().optional(),
  created:integer.optional(), timecreated:integer.optional(), timemodified:integer.optional(), message:z.string().optional(),
})).max(100), warnings:warnings.optional()});
export const postsWire = z.object({posts:z.array(z.object({
  id:integer, discussion:integer.optional(), discussionid:integer.optional(), parent:integer.nullish(), parentid:integer.nullish(),
  subject:z.string().optional(), message:z.string(), author:z.object({fullname:z.string()}).optional(), userfullname:z.string().optional(),
  created:integer.nullish(), timecreated:integer.nullish(), isdeleted:flag.optional(), isprivatereply:flag.optional(),
})).max(10_000), warnings:warnings.optional()});
export const quizzesWire = z.object({quizzes:z.array(z.object({
  id:integer, course:integer, coursemodule:integer, name:z.string(), intro:z.string().optional(),
  timeopen:integer.optional(), timeclose:integer.optional(), timelimit:integer.optional(), attempts:integer.optional(),
})).max(10_000), warnings:warnings.optional()});
export const attemptsWire = z.object({attempts:z.array(z.object({
  id:integer, quiz:integer, userid:integer, attempt:integer.optional(), state:z.string(),
  timestart:integer.optional(), timefinish:integer.optional(), timemodified:integer.optional(), sumgrades:numeric.nullish(),
})).max(1000), warnings:warnings.optional()});
export const eventsWire = z.object({events:z.array(z.object({
  id:integer, name:z.string(), courseid:integer.optional(), course:z.object({id:integer}).optional(),
  timestart:integer.optional(), timedue:integer.optional(), timesort:integer.optional(), timeduration:integer.optional(),
  description:z.string().optional(), modulename:z.string().optional(),
})).max(10_000), warnings:warnings.optional()});
export const gradesWire = z.object({usergrades:z.array(z.object({userid:integer.optional(), gradeitems:z.array(z.object({
  id:integer, itemname:z.string().nullish(), gradeformatted:z.string().nullish(), grademax:numeric.nullish(),
  percentageformatted:z.string().nullish(), gradedategraded:integer.nullish(),
})).max(10_000)})).max(100), warnings:warnings.optional()});
export const participantsWire = z.array(z.object({fullname:z.string()})).max(51);
export const assignmentsWire = z.object({courses:z.array(z.object({id:integer, assignments:z.array(z.object({
  id:integer, cmid:integer, course:integer, name:z.string(), duedate:integer.optional(),
  nosubmissions:flag.optional(), submissiondrafts:flag.optional(), teamsubmission:flag.optional(),
  requireallteammemberssubmit:flag.optional(), preventsubmissionnotingroup:flag.optional(), requiresubmissionstatement:flag.optional(),
  submissionstatement:z.string().optional(), timelimit:integer.optional(),
  configs:z.array(z.object({plugin:z.string(), subtype:z.string(), name:z.string(), value:z.union([z.string(), z.number(), z.boolean()]).transform(String)})).optional(),
})).max(10_000)})).max(1000), warnings:warnings.optional()});
export const submissionWire = z.object({lastattempt:z.object({
  submissionsenabled:flag, locked:flag, canedit:flag, caneditowner:flag.optional(), cansubmit:flag,
  submission:z.object({userid:integer.optional(), status:z.string(), plugins:z.array(z.object({
    type:z.string(), name:z.string().optional(),
    editorfields:z.array(z.object({name:z.string(), description:z.string().optional(), text:z.string().max(1_000_000), format:integer}).strict()).max(20).optional(),
    fileareas:z.array(z.object({area:z.string(), files:z.array(z.object({filename:z.string(), filesize:integer.optional()}).passthrough()).max(100)}).strict()).max(20).optional(),
  }).strict()).max(20)}).optional(),
  teamsubmission:z.unknown().optional(),
}).optional(), warnings:warnings.optional()});
