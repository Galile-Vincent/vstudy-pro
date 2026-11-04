import { createHash } from 'node:crypto';
import { z } from 'zod';
import { decodeHtmlEntities } from '../../shared/html';
import {
  moodleCourseSchema, moodleDeadlineSchema, moodleNotificationSchema, moodleGradeItemSchema, moodleFileSchema,
  type MoodleCourse, type MoodleAccount,
} from '../../shared/moodle';

export type Fetch = typeof fetch;
export class MoodleError extends Error {
  constructor(readonly kind: 'auth' | 'unsupported' | 'service' | 'network') { super(`Moodle ${kind} error`); }
}
export function plainText(value: string): string {
  return decodeHtmlEntities(value.replace(/\{mlang(?:\s+[^}]*)?\}/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
export function remoteId(account: string, kind: string, id: string | number): string {
  const hex = createHash('sha256').update(JSON.stringify([account, kind, id])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const integer = z.number().int();
const flag = z.union([z.boolean(), z.number()]).transform(Boolean);
const optionalText = z.string().nullish();
const url = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null; for (const key of [...parsed.searchParams.keys()]) if (/token|sesskey/i.test(key)) parsed.searchParams.delete(key); return parsed.href; } catch { return null; }
};
const date = (seconds: number | null | undefined): string | null => seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
const courseWire = z.object({ id: integer, fullname: z.string(), shortname: z.string(), courseimage: optionalText, overviewfiles: z.array(z.object({fileurl:z.string()})).optional(), progress: z.number().nullable().optional(), startdate: integer.optional(), enddate: integer.optional(), isfavourite: flag.optional() });
const assignmentWire = z.object({ courses: z.array(z.object({ id: integer, assignments: z.array(z.object({ id: integer, name: z.string(), duedate: integer, cmid: integer.optional() })) })) });
const eventWire = z.object({ id:integer, name:z.string(), courseid:integer.optional(), course:z.object({id:integer}).optional(), timestart:integer.optional(), timedue:integer.optional(), timesort:integer.optional(), url:optionalText, modulename:optionalText, action:z.object({url:optionalText, actionable:flag.optional()}).optional() });
const messageWire = z.object({id:integer, subject:z.string().optional(), fullmessage:z.string().optional(), fullmessagehtml:z.string().optional(), smallmessage:z.string().optional(), timecreated:integer, timeread:integer.optional(), read:flag.optional(), contexturl:optionalText, courseid:integer.optional()});
const gradeWire = z.object({ usergrades:z.array(z.object({gradeitems:z.array(z.object({id:integer, itemname:optionalText, gradeformatted:optionalText, grademax:z.number().nullable().optional(), percentageformatted:optionalText, gradedategraded:integer.nullable().optional()}))})) });
const sectionsWire = z.array(z.object({id:integer, name:z.string(), modules:z.array(z.object({id:integer, name:z.string(), contents:z.array(z.object({type:z.string(), filename:z.string(), fileurl:optionalText, filesize:integer.nonnegative().optional(), mimetype:z.string().optional(), timemodified:integer.optional()})).optional()}))}));
export const siteInfoSchema = z.object({userid:integer, fullname:z.string()});
export const publicConfigSchema = z.object({identityproviders:z.array(z.object({url:z.string().url()})).default([])});

export class MoodleClient {
  constructor(readonly host: string, private readonly token: string, private readonly request: Fetch = fetch) {}
  async call<T>(name: string, params: Record<string,string>, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try { response = await this.request(`${this.host}/webservice/rest/server.php?moodlewsrestformat=json`, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({...params,wstoken:this.token,wsfunction:name}), redirect:'error', signal:AbortSignal.timeout(30_000)}); }
    catch { throw new MoodleError('network'); }
    if (!response.ok) throw new MoodleError('network');
    const raw: unknown = await response.json().catch(() => { throw new MoodleError('service'); });
    const error = z.object({exception:z.string().optional(),errorcode:z.string().optional(),error:z.string().optional(),message:z.string().optional()}).safeParse(raw);
    if (error.success && (error.data.exception || error.data.errorcode || error.data.error)) {
      const codes = Object.values(error.data).join(' ').toLowerCase();
      throw new MoodleError(/invalidtoken|requireloginerror|invalid token|session has expired/.test(codes) ? 'auth' : /cannotfindexternalfunction|functionnotavailable|coding_exception|accessexception|invalidparameter/.test(codes) ? 'unsupported' : 'service');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new MoodleError('service');
    return parsed.data;
  }
  siteInfo() { return this.call('core_webservice_get_site_info', {}, siteInfoSchema); }
  async fallback<T>(primary: () => Promise<T>, alternative: () => Promise<T>): Promise<T> {
    try { return await primary(); } catch (error) { if (!(error instanceof MoodleError) || error.kind !== 'unsupported') throw error; return alternative(); }
  }
  async courses(account: MoodleAccount): Promise<MoodleCourse[]> {
    const timeline = async () => (await this.call('core_course_get_enrolled_courses_by_timeline_classification',{classification:'all',limit:'0',offset:'0'},z.object({courses:z.array(courseWire)}))).courses;
    const rows = await this.fallback(() => this.call('core_enrol_get_users_courses',{userid:String(account.remoteUserId)},z.array(courseWire)),timeline);
    const courses = rows.length ? rows : await timeline();
    return courses.map(row => moodleCourseSchema.parse({id:remoteId(account.id,'course',row.id),accountId:account.id,remoteId:row.id,fullName:plainText(row.fullname),shortName:plainText(row.shortname),imageUrl:url(row.courseimage ?? row.overviewfiles?.[0]?.fileurl),progress:row.progress == null ? null : Math.min(100,Math.max(0,row.progress)),startAt:date(row.startdate),endAt:date(row.enddate),favourite:row.isfavourite ?? false}));
  }
  async assignments(accountId: string, courses: MoodleCourse[]) {
    const params = Object.fromEntries(courses.map((course,index) => [`courseids[${index}]`,String(course.remoteId)]));
    const result = await this.call('mod_assign_get_assignments',params,assignmentWire);
    return result.courses.flatMap(row => {
      const course = courses.find(course => course.remoteId === row.id);
      return course ? row.assignments.filter(item => item.duedate > 0).map(item => moodleDeadlineSchema.parse({id:remoteId(accountId,'assignment',item.id),courseId:course.id,title:plainText(item.name),kind:'assignment',dueAt:date(item.duedate),url:item.cmid ? `${this.host}/mod/assign/view.php?id=${item.cmid}` : null,submitted:false})) : [];
    });
  }
  async events(accountId: string, courses: MoodleCourse[]) {
    const result = await this.fallback(() => this.call('core_calendar_get_action_events_by_timesort',{timesortfrom:'0',limitnum:'1000'},z.object({events:z.array(eventWire)})),() => this.call('core_calendar_get_calendar_upcoming_view',{},z.object({events:z.array(eventWire)})));
    return result.events.flatMap(item => {
      const course = courses.find(course => course.remoteId === (item.courseid ?? item.course?.id));
      const dueAt = date(item.timedue ?? item.timesort ?? item.timestart);
      return course && dueAt ? [moodleDeadlineSchema.parse({id:remoteId(accountId,'event',item.id),courseId:course.id,title:plainText(item.name),kind:item.modulename === 'quiz' ? 'quiz' : item.modulename === 'assign' ? 'assignment' : 'event',dueAt,url:url(item.url ?? item.action?.url),submitted:item.action?.actionable === false})] : [];
    });
  }
  async notifications(account: MoodleAccount, courses: MoodleCourse[]) {
    const get = (read: number) => this.call('core_message_get_messages',{useridto:String(account.remoteUserId),useridfrom:'0',type:'notifications',read:String(read),newestfirst:'1',limitfrom:'0',limitnum:'1000'},z.object({messages:z.array(messageWire)}));
    const result = await this.fallback(async () => (await get(2)).messages,async () => [...(await get(0)).messages.map(row => ({...row,read:false})),...(await get(1)).messages.map(row => ({...row,read:true}))]);
    return [...new Map(result.map(row => [row.id,row])).values()].map(row => ({remoteId:row.id,value:moodleNotificationSchema.parse({id:remoteId(account.id,'notification',row.id),accountId:account.id,courseId:courses.find(course => course.remoteId === row.courseid)?.id ?? null,subject:plainText(row.subject ?? ''),body:plainText(row.fullmessagehtml || row.fullmessage || row.smallmessage || ''),createdAt:date(row.timecreated),read:row.read ?? Boolean(row.timeread),url:url(row.contexturl)})}));
  }
  markRead(id: number) { return this.call('core_message_mark_notification_read',{notificationid:String(id),timeread:String(Math.floor(Date.now()/1000))},z.object({}).passthrough()); }
  async grades(course: MoodleCourse, userId: number) {
    const result = await this.call('gradereport_user_get_grade_items',{courseid:String(course.remoteId),userid:String(userId)},gradeWire);
    return result.usergrades.flatMap(user => user.gradeitems.map(row => ({remoteKey:String(row.id),value:moodleGradeItemSchema.parse({courseId:course.id,name:plainText(row.itemname ?? ''),grade:row.gradeformatted ? plainText(row.gradeformatted) : null,max:row.grademax ?? null,percentage:row.percentageformatted && Number.isFinite(parseFloat(row.percentageformatted)) ? parseFloat(row.percentageformatted) : null,gradedAt:date(row.gradedategraded)})})));
  }
  async files(course: MoodleCourse) {
    const sections = await this.call('core_course_get_contents',{courseid:String(course.remoteId)},sectionsWire);
    return sections.flatMap(section => section.modules.flatMap(module => (module.contents ?? []).filter(file => file.type === 'file' && file.fileurl && url(file.fileurl)).map(file => ({url:url(file.fileurl)!,value:moodleFileSchema.parse({id:remoteId(course.accountId,'file',`${module.id}:${file.fileurl!.split('?')[0]}`),courseId:course.id,section:plainText(section.name),module:plainText(module.name),name:plainText(file.filename),mime:file.mimetype ?? 'application/octet-stream',size:file.filesize ?? 0,modifiedAt:date(file.timemodified),documentId:null})}))));
  }
}
export async function passwordToken(host: string, username: string, password: string, request: Fetch = fetch): Promise<string> {
  try {
    const response = await request(`${host}/login/token.php`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password,service:'moodle_mobile_app'}),redirect:'error',signal:AbortSignal.timeout(30_000)});
    if (!response.ok) throw new MoodleError('auth');
    return z.object({token:z.string().min(1).max(16384)}).parse(await response.json()).token;
  } catch { throw new MoodleError('auth'); }
}
