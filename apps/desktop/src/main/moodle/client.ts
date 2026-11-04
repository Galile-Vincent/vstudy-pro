import { log } from '../logging';
import { MoodleScheduler } from './scheduler';
import { connectionTiming } from './site-url';
export interface MoodleCallTiming { function:string; ms:number; bytes:number; queueMs:number; reused:boolean | null; ok:boolean }
import { courseLifecycle, parseCourseIdentity, teacherName } from './identity';
import { contentsWire, parseCourseContents, sanitizeCourseHtml, safeUrl } from './contents';
import type { MoodleAnnouncement } from '../../shared/moodle-course';
import { moodleImage } from './files';
import { authError, type MoodleTokens } from './auth';
import { moodleFetch, siteFetch } from './site-url';
import { remoteId } from './remote-id';
export { remoteId } from './remote-id';
import { z } from 'zod';
import { decodeHtmlEntities } from '../../shared/html';
import {
  moodleCourseSchema, moodleDeadlineSchema, moodleNotificationSchema, moodleGradeItemSchema,
  type MoodleCourse, type MoodleAccount,
} from '../../shared/moodle';

export type Fetch = typeof fetch;
export class MoodleError extends Error {
  constructor(readonly kind: 'auth' | 'unsupported' | 'service' | 'network') { super(`Moodle ${kind} error`); }
}
export function plainText(value: string): string {
  return decodeHtmlEntities(value.replace(/\{mlang(?:\s+[^}]*)?\}/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
const numeric = z.union([z.number(),z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform(Number).pipe(z.number().finite());
const integer = numeric.pipe(z.number().int());
const flag = z.union([z.boolean(),z.literal(0),z.literal(1),z.literal('0'),z.literal('1')]).transform(value => value === true || value === 1 || value === '1');
const optionalText = z.string().nullish();
const url = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null; for (const key of [...parsed.searchParams.keys()]) if (/token|sesskey/i.test(key)) parsed.searchParams.delete(key); return parsed.href; } catch { return null; }
};
const date = (seconds: number | null | undefined): string | null => seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
const courseWire = z.object({ id: integer, fullname: z.string(), shortname: z.string(), courseimage: optionalText, overviewfiles: z.array(z.object({fileurl:z.string()})).optional(), progress: numeric.nullable().optional(), startdate: integer.nullish(), enddate: integer.nullish(), isfavourite: flag.optional(), hidden:flag.optional(), completed:flag.optional(), enablecompletion:flag.optional(), format:optionalText, summary:optionalText, contacts:z.array(z.object({id:integer.optional(),fullname:z.string()})).optional() });
const assignmentWire = z.object({ courses: z.array(z.object({ id: integer, assignments: z.array(z.object({ id: integer, name: z.string(), duedate: integer, cmid: integer.optional() })) })) });
const eventWire = z.object({ id:integer, name:z.string(), courseid:integer.optional(), course:z.object({id:integer}).optional(), timestart:integer.optional(), timedue:integer.optional(), timesort:integer.optional(), url:optionalText, modulename:optionalText, instance:integer.nullish(), action:z.object({url:optionalText, actionable:flag.optional()}).optional() });
const messageWire = z.object({id:integer, subject:z.string().optional(), text:optionalText, customdata:optionalText, fullmessage:z.string().nullish(), fullmessagehtml:z.string().optional(), smallmessage:z.string().optional(), timecreated:integer, timeread:integer.nullish(), read:flag.optional(), contexturl:optionalText, courseid:integer.optional()});
const gradeWire = z.object({ usergrades:z.array(z.object({gradeitems:z.array(z.object({id:integer, itemname:optionalText, gradeformatted:optionalText, grademax:numeric.nullable().optional(), percentageformatted:optionalText, gradedategraded:integer.nullable().optional()}))})) });
export const siteInfoSchema = z.object({userid:integer, fullname:z.string(),siteurl:z.string().optional(),version:z.string().optional(),release:z.string().optional(),functions:z.array(z.object({name:z.string(),version:z.union([z.string(),z.number()]).optional()})).optional(),advancedfeatures:z.array(z.object({name:z.string(),value:z.union([z.string(),z.number(),z.boolean()])})).default([]),userprivateaccesskey:z.string().optional()});
export { publicConfigSchema } from './discovery';

export class MoodleClient {
  private functions: Set<string> | undefined;
  private language = 'zh-tw';
  private langSupported = true;
  setLanguage(language: string) { this.language = language.replace(/_/g,'-').toLowerCase(); }
  setFunctions(functions: string[] | undefined) { this.functions = functions ? new Set(functions) : undefined; }
  wsAvailable(name: string) { return !this.functions || this.functions.has(name); }
  constructor(readonly host: string, private readonly token: string, private readonly request: Fetch = moodleFetch, private readonly scheduling?: {queue:MoodleScheduler;priority:number;timing?:(call:MoodleCallTiming)=>void}) {}
  async call<S extends z.ZodTypeAny>(name: string, params: Record<string,string>, schema: S, retryLanguage = true, signal?: AbortSignal): Promise<z.output<S>> {
    const run = async (queueMs:number) => {
      const started = performance.now();
      const timing: MoodleCallTiming = {function:name,ms:0,bytes:0,queueMs,reused:null,ok:false};
      try { const result = await this.performCall(name,params,schema,retryLanguage,signal,timing); timing.ok=true; return result; }
      finally { timing.ms=performance.now()-started; log({phase:'moodle-call',...timing}); this.scheduling?.timing?.(timing); }
    };
    return this.scheduling ? this.scheduling.queue.run(this.scheduling.priority,run) : run(0);
  }
  private async performCall<S extends z.ZodTypeAny>(name:string, params:Record<string,string>, schema:S, retryLanguage:boolean, signal:AbortSignal | undefined, timing:MoodleCallTiming):Promise<z.output<S>> {
    if (name !== 'core_webservice_get_site_info' && !this.wsAvailable(name)) throw new MoodleError('unsupported');
    let response: Response;
    try { response = await siteFetch(this.host,this.request)(`${this.host}/webservice/rest/server.php?moodlewsrestformat=json`, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({...params,moodlewssettingfilter:'1',...(this.langSupported ? {moodlewssettinglang:this.language} : {}),wstoken:this.token,wsfunction:name}), redirect:'error', signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)}); }
    catch { throw new MoodleError('network'); }
    if (!response.ok) throw new MoodleError('network');
    timing.reused = connectionTiming.get(response)?.reused ?? null;
    const text = await response.text();
    timing.bytes += Buffer.byteLength(text);
    let raw:unknown;
    try { raw = JSON.parse(text); } catch { throw new MoodleError('service'); }
    const error = z.object({exception:z.string().optional(),errorcode:z.string().optional(),error:z.string().optional(),message:z.string().optional()}).safeParse(raw);
    if (error.success && (error.data.exception || error.data.errorcode || error.data.error)) {
      if (retryLanguage && this.langSupported && /invalidparameter|invalid_parameter/.test(error.data.errorcode ?? '') && /moodlewssettinglang|lang/i.test(error.data.message ?? '')) { this.langSupported = false; return this.performCall(name,params,schema,false,signal,timing); }
      const codes = [error.data.errorcode,error.data.exception].map(code => code?.toLowerCase());
      throw new MoodleError(codes.some(code => code === 'invalidtoken' || code === 'requireloginerror' || code === 'accessexception') ? 'auth' : codes.some(code => ['cannotfindexternalfunction','functionnotavailable','coding_exception'].includes(code ?? '')) ? 'unsupported' : 'service');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new MoodleError('service');
    return parsed.data;
  }
  mobileConfig() { return this.call('tool_mobile_get_config',{},z.object({settings:z.array(z.object({name:z.string(),value:z.string()})).default([])})); }
  siteInfo() { return this.call('core_webservice_get_site_info', {}, siteInfoSchema); }
  async fallback<T>(primary: () => Promise<T>, alternative: () => Promise<T>): Promise<T> {
    try { return await primary(); } catch (error) { if (!(error instanceof MoodleError) || error.kind !== 'unsupported') throw error; return alternative(); }
  }
  async courses(account: MoodleAccount): Promise<MoodleCourse[]> {
    const timeline = async () => {
      const rows = new Map<number,z.infer<typeof courseWire>>();
      let offset = 0;
      for (let page = 0; page < 100; page++) {
        const result = await this.call('core_course_get_enrolled_courses_by_timeline_classification',{classification:'all',limit:'100',offset:String(offset)},z.object({courses:z.array(courseWire),nextoffset:integer.optional()}));
        const before = rows.size;
        result.courses.forEach(row => { if (row.id > 0) rows.set(row.id,row); });
        if (rows.size === before || !result.nextoffset || result.nextoffset <= offset) break;
        offset = result.nextoffset;
      }
      return [...rows.values()];
    };
    const rows = await this.fallback(() => this.call('core_enrol_get_users_courses',{userid:String(account.remoteUserId)},z.array(courseWire)),timeline);
    const courses = rows.length ? rows : await timeline();
    const buckets = new Map<number,'past'|'current'|'future'>();
    const rowsById = new Map(courses.filter(row => row.id > 0).map(row => [row.id,row]));
    if (this.functions?.has('core_course_get_enrolled_courses_by_timeline_classification')) {
      for (const [classification,lifecycle] of [['past','past'],['inprogress','current'],['future','future']] as const) {
        let offset = 0;
        for (let page = 0; page < 100; page++) {
          let result;
          try { result = await this.call('core_course_get_enrolled_courses_by_timeline_classification',{classification,limit:'100',offset:String(offset)},z.object({courses:z.array(courseWire),nextoffset:integer.optional()})); }
          catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; break; }
          let added = 0;
          for (const row of result.courses) {
            if (row.id <= 0) continue;
            if (!buckets.has(row.id)) added++;
            buckets.set(row.id,lifecycle);
            rowsById.set(row.id,{...rowsById.get(row.id),...row});
          }
          if (!added || !result.nextoffset || result.nextoffset <= offset) break;
          offset = result.nextoffset;
        }
      }
    }
    const mapped = [...rowsById.values()].map(row => {
      const identity = parseCourseIdentity(row.fullname,row.shortname,row.progress != null);
      const startAt = date(row.startdate), endAt = date(row.enddate);
      Object.assign(identity,courseLifecycle({startAt,endAt,term:identity.term,completed:row.completed ?? false,...(buckets.has(row.id) ? {server:buckets.get(row.id)!} : {})}));
      identity.enableCompletion = row.enablecompletion ?? false;
      identity.hidden = row.hidden ?? false;
      identity.format = row.format ?? null;
      identity.summaryHtml = sanitizeCourseHtml(row.summary);
      identity.teacherSource = row.contacts?.length ? 'contacts' : 'name';
      if (row.contacts?.length) identity.teachers = row.contacts.map(contact => { const name = teacherName(contact.fullname); return /[\u3400-\u9fff]/.test(name) ? {zh:name,en:null} : {zh:null,en:name}; });
      return moodleCourseSchema.parse({id:remoteId(account.id,'course',row.id),accountId:account.id,remoteId:row.id,fullName:plainText(row.fullname),shortName:plainText(row.shortname),imageUrl:url(row.courseimage ?? row.overviewfiles?.[0]?.fileurl),progress:row.progress == null ? null : Math.min(100,Math.max(0,row.progress)),startAt,endAt,favourite:row.isfavourite ?? false,identity});
    });
    return Promise.all(mapped.map(async course => ({...course,imageUrl:course.imageUrl ? await moodleImage(course.imageUrl,this.host,this.token,this.request) : null})));
  }
  async assignments(accountId: string, courses: MoodleCourse[], submissionStatus = true) {
    courses = courses.filter(course => !course.endAt || Date.parse(course.endAt) >= Date.now() - 14 * 86400000);
    if (!courses.length) return [];
    const params = Object.fromEntries(courses.map((course,index) => [`courseids[${index}]`,String(course.remoteId)]));
    const result = await this.call('mod_assign_get_assignments',params,assignmentWire);
    const deadlines = result.courses.flatMap(row => {
      const course = courses.find(course => course.remoteId === row.id);
      return course ? row.assignments.filter(item => item.duedate > 0).map(item => moodleDeadlineSchema.parse({id:remoteId(accountId,'assignment',item.id),courseId:course.id,title:plainText(item.name),kind:'assignment',dueAt:date(item.duedate),url:item.cmid ? `${this.host}/mod/assign/view.php?id=${item.cmid}` : null,submitted:false})) : [];
    });
    if (!submissionStatus) return deadlines.map(item => ({...item,submitted:null}));
    return this.withSubmissionStatus(deadlines, async item => {
      const assignment = result.courses.flatMap(row => row.assignments).find(row => remoteId(accountId,'assignment',row.id) === item.id)!;
      const status = await this.call('mod_assign_get_submission_status',{assignid:String(assignment.id)},z.object({lastattempt:z.object({submission:z.object({status:optionalText}).nullish()}).nullish()}));
      return status.lastattempt?.submission?.status?.toLowerCase() === 'submitted';
    });
  }
  private async withSubmissionStatus<T extends {submitted:boolean | null}>(items: T[], status: (item:T) => Promise<boolean>): Promise<T[]> {
    let next = 0;
    await Promise.all(Array.from({length:Math.min(4,items.length)},async () => {
      while (next < items.length) {
        const item = items[next++]!;
        try { item.submitted = await status(item); } catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; item.submitted = null; }
      }
    }));
    return items;
  }
  async events(accountId: string, courses: MoodleCourse[]) {
    const upcoming = () => this.call('core_calendar_get_calendar_upcoming_view',{courseid:'0',categoryid:'0'},z.object({events:z.array(eventWire)}));
    const timeline = async () => {
      const events: z.infer<typeof eventWire>[] = [];
      let after = 0;
      while (true) {
        const page = await this.call('core_calendar_get_action_events_by_timesort',{timesortfrom:String(Math.floor(Date.now()/1000) - 14 * 86400),limittononsuspendedevents:'1',limitnum:'50',...(after ? {aftereventid:String(after)} : {})},z.object({events:z.array(eventWire),lastid:integer.optional()}));
        if (!page.events.length) break;
        if (page.events.some(item => events.some(previous => previous.id === item.id))) throw new MoodleError('service');
        events.push(...page.events);
        if (page.events.length < 50) break;
        if (!page.lastid || page.lastid === after) throw new MoodleError('service');
        after = page.lastid;
      }
      return {events};
    };
    const action = await this.fallback(timeline,async () => ({events:[]}));
    const ordinary = await this.fallback(upcoming,async () => ({events:[]}));
    const result = {events:[...new Map([...ordinary.events,...action.events].map(item => [item.id,item])).values()]};
    const deadlines = result.events.flatMap(item => {
      const course = courses.find(course => course.remoteId === (item.courseid ?? item.course?.id));
      const dueAt = date(item.timedue ?? item.timesort ?? item.timestart);
      return course && dueAt ? [moodleDeadlineSchema.parse({id:remoteId(accountId,'event',item.id),courseId:course.id,title:plainText(item.name),kind:item.modulename === 'quiz' ? 'quiz' : item.modulename === 'assign' ? 'assignment' : 'event',dueAt,url:url(item.url ?? item.action?.url),submitted:false})] : [];
    });
    return this.withSubmissionStatus(deadlines,async item => {
      const event = result.events.find(event => remoteId(accountId,'event',event.id) === item.id)!;
      if (!event.instance) return false;
      if (item.kind === 'assignment') {
        const status = await this.call('mod_assign_get_submission_status',{assignid:String(event.instance)},z.object({lastattempt:z.object({submission:z.object({status:optionalText}).nullish()}).nullish()}));
        return status.lastattempt?.submission?.status?.toLowerCase() === 'submitted';
      }
      if (item.kind !== 'quiz') return false;
      const attempts = await this.call('mod_quiz_get_user_attempts',{quizid:String(event.instance),status:'all'},z.object({attempts:z.array(z.object({state:z.string()}))}));
      return attempts.attempts.some(attempt => attempt.state === 'finished');
    });
  }
  async notifications(account: MoodleAccount, courses: MoodleCourse[]) {
    const getPage = (read: number, offset: number) => this.call('core_message_get_messages',{useridto:String(account.remoteUserId),useridfrom:'0',type:'notifications',read:String(read),newestfirst:'1',limitfrom:String(offset),limitnum:'100'},z.object({messages:z.array(messageWire)}));
    const get = async (read: number) => {
      const messages: z.infer<typeof messageWire>[] = [];
      while (true) {
        const page = await getPage(read,messages.length);
        if (page.messages.some(item => messages.some(previous => previous.id === item.id))) throw new MoodleError('service');
        messages.push(...page.messages);
        if (page.messages.length < 100) return {messages};
      }
    };
    let source: 'message' | 'popup' = 'message';
    const result = await this.fallback(
      () => this.fallback(async () => (await get(2)).messages,async () => [...(await get(0)).messages.map(row => ({...row,read:false})),...(await get(1)).messages.map(row => ({...row,read:true}))]),
      async () => {
        source = 'popup';
        const notifications: z.infer<typeof messageWire>[] = [];
        while (true) {
          const page = await this.call('message_popup_get_popup_notifications',{useridto:String(account.remoteUserId),offset:String(notifications.length),limit:'100',newestfirst:'1'},z.object({notifications:z.array(messageWire)}));
          if (notifications.length >= 10000) throw new MoodleError('service');
          notifications.push(...page.notifications);
          if (page.notifications.length < 100) return notifications;
        }
      },
    );
    const courseId = (row: z.infer<typeof messageWire>) => {
      if (row.courseid) return row.courseid;
      try { return z.object({courseid:z.coerce.number().int().positive()}).parse(JSON.parse(row.customdata ?? '{}')).courseid; } catch { return undefined; }
    };
    return [...new Map(result.map(row => [row.id,row])).values()].map(row => ({remoteId:row.id,value:moodleNotificationSchema.parse({id:remoteId(account.id,source === 'popup' ? 'popup-notification' : 'notification',row.id),accountId:account.id,source,courseId:courses.find(course => course.remoteId === courseId(row))?.id ?? null,subject:plainText(row.subject ?? ''),body:plainText(row.fullmessagehtml || row.fullmessage || row.text || row.smallmessage || ''),createdAt:date(row.timecreated),read:row.read ?? Boolean(row.timeread),url:url(row.contexturl)})}));
  }
  markRead(id: number) { return this.call('core_message_mark_notification_read',{notificationid:String(id),timeread:String(Math.floor(Date.now()/1000))},z.object({}).passthrough()); }
  async grades(course: MoodleCourse, userId: number) {
    const result = await this.call('gradereport_user_get_grade_items',{courseid:String(course.remoteId),userid:String(userId)},gradeWire);
    return result.usergrades.flatMap(user => user.gradeitems.map(row => ({remoteKey:String(row.id),value:moodleGradeItemSchema.parse({courseId:course.id,name:plainText(row.itemname ?? ''),grade:row.gradeformatted ? plainText(row.gradeformatted) : null,max:row.grademax ?? null,percentage:row.percentageformatted && Number.isFinite(parseFloat(plainText(row.percentageformatted))) ? parseFloat(plainText(row.percentageformatted)) : null,gradedAt:date(row.gradedategraded)})})));
  }
  async courseContents(course: MoodleCourse) {
    const sections = await this.call('core_course_get_contents',{courseid:String(course.remoteId)},contentsWire);
    return parseCourseContents(sections,course);
  }
  async files(course: MoodleCourse) { return (await this.courseContents(course)).files; }
  async quizDeadlines(course: MoodleCourse) {
    const result = await this.call('mod_quiz_get_quizzes_by_courses',{'courseids[0]':String(course.remoteId)},z.object({quizzes:z.array(z.object({id:integer,name:z.string(),coursemodule:integer,timeclose:integer.optional()}))}));
    const deadlines = result.quizzes.flatMap(quiz => {
      const dueAt = date(quiz.timeclose);
      return dueAt ? [{title:plainText(quiz.name),courseId:course.id,kind:'quiz' as const,dueAt,url:`${this.host}/mod/quiz/view.php?id=${quiz.coursemodule}`,submitted:null as boolean | null,id:remoteId(course.accountId,'quiz',quiz.id)}] : [];
    });
    return this.withSubmissionStatus(deadlines,async deadline => {
      const quiz = result.quizzes.find(quiz => remoteId(course.accountId,'quiz',quiz.id) === deadline.id)!;
      const attempts = await this.call('mod_quiz_get_user_attempts',{quizid:String(quiz.id),status:'all'},z.object({attempts:z.array(z.object({state:z.string()}))}));
      return attempts.attempts.some(attempt => attempt.state === 'finished');
    });
  }
  async completion(course: MoodleCourse, userId: number) {
    const result = await this.call('core_completion_get_activities_completion_status',{courseid:String(course.remoteId),userid:String(userId)},z.object({statuses:z.array(z.object({cmid:integer,state:integer,tracking:integer.optional()}))}));
    return result.statuses;
  }
  async teachers(course: MoodleCourse) {
    const users = new Map<number,{fullname:string;roles:{shortname:string}[]}>();
    const deadline = Date.now() + 8000;
    const signal = AbortSignal.timeout(8000);
    for (let page = 0; page < 50 && Date.now() < deadline; page++) {
      const rows = await this.call('core_enrol_get_enrolled_users',{courseid:String(course.remoteId),'options[0][name]':'limitfrom','options[0][value]':String(page*200),'options[1][name]':'limitnumber','options[1][value]':'200'},z.array(z.object({id:integer,fullname:z.string(),roles:z.array(z.object({shortname:z.string()})).default([])})),true,signal);
      let added = 0;
      for (const row of rows) if (!users.has(row.id)) { users.set(row.id,row); added++; }
      if (!added || rows.length < 200) break;
    }
    const rows = [...users.values()];
    const editing = rows.filter(user => user.roles.some(role => role.shortname === 'editingteacher'));
    return (editing.length ? editing : rows.filter(user => user.roles.some(role => role.shortname === 'teacher'))).map(user => {
      const name = teacherName(user.fullname);
      return /[\u3400-\u9fff]/.test(name) ? {zh:name,en:null} : {zh:null,en:name};
    });
  }
  async announcements(course: MoodleCourse): Promise<MoodleAnnouncement[]> {
    const forums = await this.call('mod_forum_get_forums_by_courses',{'courseids[0]':String(course.remoteId)},z.array(z.object({id:integer,type:z.string().optional(),name:z.string()})));
    const selected = forums.filter(forum => forum.type === 'news' || /公告|最新消息|announcement|news/i.test(plainText(forum.name))).sort((a,b) => Number(b.type === 'news') - Number(a.type === 'news')).slice(0,3);
    const discussion = z.object({id:integer,discussion:integer.optional(),subject:z.string().optional(),name:z.string().optional(),userfullname:z.string().optional(),userid:integer.optional(),created:integer.optional(),timecreated:integer.optional(),timemodified:integer.optional(),message:z.string().optional()});
    const rows = new Map<number,z.infer<typeof discussion>>();
    for (const forum of selected) {
      for (let page = 0; page < 10; page++) {
        const params = {forumid:String(forum.id),page:String(page),perpage:'20',sortorder:'1'};
        const result = await this.fallback(() => this.call('mod_forum_get_forum_discussions',params,z.object({discussions:z.array(discussion)})),() => this.call('mod_forum_get_forum_discussions_paginated',{...params,sortby:'created',sortdirection:'DESC'},z.object({discussions:z.array(discussion)})));
        let added = 0;
        for (const row of result.discussions) { const id = row.discussion ?? row.id; if (id > 0 && !rows.has(id)) {rows.set(id,row);added++;} }
        if (!added || result.discussions.length < 20) break;
      }
    }
    const newest = [...rows.entries()].sort((a,b) => (b[1].created ?? b[1].timecreated ?? b[1].timemodified ?? 0) - (a[1].created ?? a[1].timecreated ?? a[1].timemodified ?? 0));
    for (const [id,row] of newest.slice(0,20)) {
      if (row.message || !this.wsAvailable('mod_forum_get_discussion_posts')) continue;
      try {
        const result = await this.call('mod_forum_get_discussion_posts',{discussionid:String(id),sortby:'created',sortdirection:'ASC'},z.object({posts:z.array(z.object({id:integer,parent:integer.optional(),message:z.string(),author:z.object({fullname:z.string()}).optional()}))}));
        const post = result.posts.find(post => post.parent === 0) ?? result.posts[0];
        if (post) {row.message = post.message;row.userfullname ??= post.author?.fullname;}
      } catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; }
    }
    const teacherNames = new Set(course.identity.teachers.flatMap(teacher => [teacher.zh,teacher.en]).filter(Boolean).map(name => teacherName(name!).toLowerCase()));
    newest.sort((a,b) => Number(teacherNames.has(teacherName(b[1].userfullname ?? '').toLowerCase())) - Number(teacherNames.has(teacherName(a[1].userfullname ?? '').toLowerCase())));
    return newest.flatMap(([id,row]) => {
      const createdAt = date(row.created ?? row.timecreated ?? row.timemodified);
      return createdAt ? [{id:remoteId(course.accountId,'announcement',id),subject:plainText(row.subject ?? row.name ?? ''),author:teacherName(row.userfullname ?? ''),createdAt,bodyHtml:sanitizeCourseHtml(row.message) ?? '',url:safeUrl(`${this.host}/mod/forum/discuss.php?d=${id}`)}] : [];
    });
  }

}
export async function passwordToken(host: string, username: string, password: string, request: Fetch = moodleFetch): Promise<MoodleTokens> {
  let response: Response;
  try {
    response = await siteFetch(host,request)(`${host}/login/token.php`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password,service:'moodle_mobile_app'}),redirect:'error',signal:AbortSignal.timeout(30_000)});
  } catch { throw new MoodleError('network'); }
  if (!response.ok) throw new MoodleError('network');
  const raw: unknown = await response.json();
  const error = z.object({errorcode:z.string()}).safeParse(raw);
  if (error.success) throw authError(error.data.errorcode);
  const result = z.object({token:z.string().min(1).max(16384),privatetoken:z.string().min(1).max(16384).optional()}).safeParse(raw);
  if (!result.success) throw new MoodleError('service');
  return {token:result.data.token,...(result.data.privatetoken ? {privateToken:result.data.privatetoken} : {})};
}
