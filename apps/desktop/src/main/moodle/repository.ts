import { moodleSectionSchema, moodleAnnouncementSchema, type MoodleSection, type MoodleAnnouncement } from '../../shared/moodle-course';
import { parseCourseIdentity, courseLifecycle } from './identity';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  moodleAccountSchema, moodleCourseSchema, moodleDeadlineSchema, moodleNotificationSchema, moodleGradeItemSchema, moodleFileSchema, moodleReminderSchema,
  type MoodleAccount, type MoodleCourse, type MoodleDeadline, type MoodleNotification, type MoodleGradeItem, type MoodleFile, type MoodleReminder, type MoodleCourseDetail, type MoodleOverview,
} from '../../shared/moodle';
import { remoteId } from './client';

export interface MoodleSnapshot {
  courses: MoodleCourse[];
  deadlines: MoodleDeadline[];
  notifications: {remoteId:number;value:MoodleNotification}[];
  grades: {remoteKey:string;value:MoodleGradeItem}[];
  files: {url:string;value:MoodleFile}[];
}
const capabilitiesSchema = z.object({functions:z.array(z.string()).optional(),release:z.string().optional(),version:z.string().optional(),advancedfeatures:z.array(z.object({name:z.string(),value:z.union([z.string(),z.number(),z.boolean()])})),mobileConfig:z.record(z.string())});
const storedCourseSchema = z.preprocess(value => {
  const parsed = z.object({fullName:z.string(),shortName:z.string(),startAt:z.string().nullable(),endAt:z.string().nullable(),progress:z.number().nullable().optional(),identity:z.unknown().optional()}).safeParse(value);
  if (!parsed.success) return value;
  const row = parsed.data;
  if (row.identity) return value;
  const identity = parseCourseIdentity(row.fullName,row.shortName,row.progress != null);
  Object.assign(identity,courseLifecycle({startAt:row.startAt,endAt:row.endAt,term:identity.term}));
  return {...(value as Record<string,unknown>),identity};
},moodleCourseSchema);
const payload = z.object({data:z.string()});
export class MoodleRepository {
  constructor(private readonly db: DatabaseSync) {
    for (const row of db.prepare("SELECT id,data FROM moodle_courses WHERE json_type(data,'$.identity') IS NULL").all()) {
      const parsed = storedCourseSchema.safeParse(JSON.parse(payload.parse(row).data));
      if (!parsed.success) continue;
      const course = parsed.data;
      db.prepare('UPDATE moodle_courses SET data=? WHERE id=?').run(JSON.stringify(course),course.id);
    }
  }
  private rows<T>(sql: string, schema: z.ZodType<T,z.ZodTypeDef,unknown>, ...params: string[]): T[] {
    return this.db.prepare(sql).all(...params).map(row => schema.parse(JSON.parse(payload.parse(row).data)));
  }
  capabilities(id: string) { return this.rows('SELECT data FROM moodle_capabilities WHERE accountId=?',capabilitiesSchema,id)[0]; }
  saveCapabilities(id: string, capabilities: z.infer<typeof capabilitiesSchema>) {
    this.db.prepare('INSERT INTO moodle_capabilities VALUES (?,?) ON CONFLICT(accountId) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(capabilitiesSchema.parse(capabilities)));
  }
  accounts() { return this.rows('SELECT data FROM moodle_accounts ORDER BY id',moodleAccountSchema); }
  account(id: string): MoodleAccount {
    const account = this.accounts().find(account => account.id === id);
    if (!account) throw new Error('Moodle account not found');
    return account;
  }
  saveAccount(account: MoodleAccount) {
    this.db.prepare('INSERT INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(account.id,account.siteUrl,account.remoteUserId,JSON.stringify(moodleAccountSchema.parse(account)));
  }
  disconnect(id: string) { this.db.prepare('DELETE FROM moodle_accounts WHERE id=?').run(id); }
  expired(id: string) { this.saveAccount({...this.account(id),status:'expired'}); }
  overview(accountId?: string): MoodleOverview {
    const accounts = this.accounts().filter(account => !accountId || account.id === accountId);
    const courses = this.rows('SELECT data FROM moodle_courses ORDER BY id',storedCourseSchema).filter(course => accounts.some(account => account.id === course.accountId));
    const ids = new Set(courses.map(course => course.id));
    const upcoming = this.rows('SELECT data FROM moodle_deadlines',moodleDeadlineSchema).filter(item => ids.has(item.courseId) && !item.submitted && !item.orphaned).sort((a,b) => a.dueAt.localeCompare(b.dueAt));
    const notifications = this.rows('SELECT data FROM moodle_notifications',moodleNotificationSchema).filter(item => accounts.some(account => account.id === item.accountId));
    return {accounts,courses,upcoming,summaries:courses.map(course => ({course,notifications:notifications.filter(item => item.courseId === course.id),reminders:this.reminders().filter(item => upcoming.some(deadline => deadline.courseId === course.id && deadline.id === item.deadlineId))})),otherNotifications:notifications.filter(item => item.courseId === null),unreadNotifications:notifications.filter(item => !item.read).length};
  }
  course(id: string): MoodleCourseDetail {
    const course = this.rows('SELECT data FROM moodle_courses WHERE id=?',storedCourseSchema,id)[0];
    if (!course) throw new Error('Moodle course not found');
    const cache = this.detailCache(id);
    const deadlines = this.rows('SELECT data FROM moodle_deadlines WHERE courseId=?',moodleDeadlineSchema,id).filter(item => !item.orphaned);
    return {course,deadlines,notifications:this.rows('SELECT data FROM moodle_notifications WHERE accountId=?',moodleNotificationSchema,course.accountId).filter(item => item.courseId === id),grades:this.rows('SELECT data FROM moodle_grades WHERE courseId=?',moodleGradeItemSchema,id),files:this.files(id),reminders:this.reminders().filter(item => deadlines.some(deadline => deadline.id === item.deadlineId)),sections:cache?.sections ?? [],announcements:cache?.announcements ?? []};
  }
  detailCache(id: string) {
    return this.rows('SELECT data FROM moodle_course_details WHERE courseId=?',z.object({sections:z.array(moodleSectionSchema).default([]),announcements:z.array(moodleAnnouncementSchema).default([]),refreshedAt:z.string()}),id)[0];
  }
  saveDetail(id: string, panels: {sections?:MoodleSection[];announcements?:MoodleAnnouncement[]}, files?:MoodleSnapshot['files']) {
    this.course(id);
    const previous = this.detailCache(id);
    const data = {...previous,...panels,refreshedAt:new Date().toISOString()};
    this.db.exec('SAVEPOINT moodle_detail');
    try {
      this.db.prepare('INSERT INTO moodle_course_details(courseId,data) VALUES (?,?) ON CONFLICT(courseId) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(data));
      if (files) {
        for (const item of files) {
          if (item.value.courseId !== id) throw new Error('Moodle course mismatch');
          this.db.prepare(`INSERT INTO moodle_files(id,courseId,url,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,data=excluded.data,documentId=CASE WHEN json_extract(moodle_files.data,'$.modifiedAt') IS json_extract(excluded.data,'$.modifiedAt') AND json_extract(moodle_files.data,'$.size')=json_extract(excluded.data,'$.size') THEN moodle_files.documentId ELSE NULL END`).run(item.value.id,id,item.url,JSON.stringify(item.value));
        }
        const keep = new Set(files.map(file => file.value.id));
        for (const file of this.files(id)) if (!keep.has(file.id)) this.db.prepare('DELETE FROM moodle_files WHERE id=?').run(file.id);
      }
      this.db.exec('RELEASE moodle_detail');
    } catch (error) { this.db.exec('ROLLBACK TO moodle_detail; RELEASE moodle_detail'); throw error; }
  }
  saveCourse(course: MoodleCourse) {
    this.db.prepare('UPDATE moodle_courses SET data=? WHERE id=? AND accountId=?').run(JSON.stringify(moodleCourseSchema.parse(course)),course.id,course.accountId);
  }
  private files(courseId: string) {
    return this.db.prepare('SELECT data,documentId FROM moodle_files WHERE courseId=?').all(courseId).map(row => moodleFileSchema.parse({...JSON.parse(payload.parse(row).data),documentId:row.documentId}));
  }
  file(id: string) {
    const row = this.db.prepare('SELECT data,url,documentId FROM moodle_files WHERE id=?').get(id);
    if (!row) throw new Error('Moodle file not found');
    const file = moodleFileSchema.parse({...JSON.parse(payload.parse(row).data),documentId:row.documentId});
    return {file,url:z.string().parse(row.url),account:this.account(this.course(file.courseId).course.accountId)};
  }
  gradeRecords(courseId: string) {
    return this.db.prepare('SELECT data,remoteKey FROM moodle_grades WHERE courseId=?').all(courseId).map(row => ({remoteKey:z.string().parse(row.remoteKey),value:moodleGradeItemSchema.parse(JSON.parse(payload.parse(row).data))}));
  }
  fileRecords(courseId: string) { return this.files(courseId).map(value => ({value,url:this.file(value.id).url})); }
  linkFile(id: string, documentId: string, revision: Pick<MoodleFile,'modifiedAt'|'size'>) { this.db.prepare("UPDATE moodle_files SET documentId=? WHERE id=? AND json_extract(data,'$.modifiedAt') IS ? AND json_extract(data,'$.size')=?").run(documentId,id,revision.modifiedAt,revision.size); }
  apply(accountId: string, snapshot: MoodleSnapshot, scope?: string) {
    this.db.exec('SAVEPOINT moodle_sync');
    try {
      const account = this.account(accountId);
      for (const incoming of snapshot.courses) {
        let course = incoming;
        const previous = this.rows('SELECT data FROM moodle_courses WHERE id=?',storedCourseSchema,course.id)[0];
        if (previous && course.identity.teacherSource !== 'contacts' && (previous.identity.teacherSource === 'enrolment' || !course.identity.teachers.length)) course = {...course,identity:{...course.identity,teachers:previous.identity.teachers,...(previous.identity.teacherSource ? {teacherSource:previous.identity.teacherSource} : {})}};
        if (course.accountId !== accountId) throw new Error('Moodle account mismatch');
        this.db.prepare('INSERT INTO moodle_courses(id,accountId,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(course.id,accountId,JSON.stringify(course));
      }
      const courseIds = new Set(snapshot.courses.map(course => course.id));
      for (const item of [...snapshot.deadlines,...snapshot.grades.map(item => item.value),...snapshot.files.map(item => item.value)]) if (!courseIds.has(item.courseId)) throw new Error('Moodle course mismatch');
      for (const item of snapshot.deadlines) this.db.prepare('INSERT INTO moodle_deadlines(id,courseId,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id,item.courseId,JSON.stringify(item));
      for (const {remoteId,value:item} of snapshot.notifications) {
        if (item.accountId !== accountId || item.courseId && !courseIds.has(item.courseId)) throw new Error('Moodle account mismatch');
        const existing = this.notification(item.id);
        this.db.prepare('INSERT INTO moodle_notifications(id,remoteId,accountId,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id,remoteId,accountId,JSON.stringify({...item,read:item.read || existing?.read === true,...(existing?.pendingRemoteRead ? {pendingRemoteRead:true} : {})}));
      }
      for (const item of snapshot.grades) this.db.prepare('INSERT INTO moodle_grades(id,remoteKey,courseId,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(remoteId(accountId,'grade',`${item.value.courseId}:${item.remoteKey}`),item.remoteKey,item.value.courseId,JSON.stringify(item.value));
      for (const item of snapshot.files) this.db.prepare(`INSERT INTO moodle_files(id,courseId,url,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,data=excluded.data,documentId=CASE WHEN json_extract(moodle_files.data,'$.modifiedAt') IS json_extract(excluded.data,'$.modifiedAt') AND json_extract(moodle_files.data,'$.size')=json_extract(excluded.data,'$.size') THEN moodle_files.documentId ELSE NULL END`).run(item.value.id,item.value.courseId,item.url,JSON.stringify(item.value));
      const prune = (table: 'courses'|'deadlines'|'notifications'|'grades'|'files', ids: Set<string>) => {
        if (scope === '@notifications' && table !== 'notifications' && table !== 'courses' || scope && scope !== '@notifications' && (table === 'notifications' || table === 'courses')) return;
        const scoped = scope && scope !== '@notifications' ? 'courseId=?' : table === 'courses' || table === 'notifications' ? 'accountId=?' : 'courseId IN (SELECT id FROM moodle_courses WHERE accountId=?)';
        const rows = this.db.prepare(`SELECT id FROM moodle_${table} WHERE ${scoped}`).all(scope && scope !== '@notifications' ? scope : accountId);
        for (const row of rows) if (typeof row.id === 'string' && !ids.has(row.id)) {
          if (table === 'notifications' && this.notification(row.id)?.pendingRemoteRead) continue;
          if (table === 'deadlines' && this.reminders().some(item => item.deadlineId === row.id)) {
            const deadline = this.deadlines([row.id])[0]!;
            this.db.prepare('UPDATE moodle_deadlines SET data=? WHERE id=?').run(JSON.stringify({...deadline,orphaned:true}),row.id);
            for (const reminder of this.reminders().filter(item => item.deadlineId === row.id)) this.db.prepare('UPDATE moodle_reminders SET data=? WHERE id=?').run(JSON.stringify({...reminder,orphaned:true}),reminder.id);
            continue;
          }
          if (table === 'courses' && this.db.prepare('SELECT 1 FROM moodle_reminders r JOIN moodle_deadlines d ON d.id=r.deadlineId WHERE d.courseId=?').get(row.id)) {
            const deadlines = this.rows('SELECT data FROM moodle_deadlines WHERE courseId=?',moodleDeadlineSchema,row.id);
            for (const deadline of deadlines) this.db.prepare('UPDATE moodle_deadlines SET data=? WHERE id=?').run(JSON.stringify({...deadline,orphaned:true}),deadline.id);
            for (const reminder of this.reminders().filter(item => deadlines.some(deadline => deadline.id === item.deadlineId))) this.db.prepare('UPDATE moodle_reminders SET data=? WHERE id=?').run(JSON.stringify({...reminder,orphaned:true}),reminder.id);
            continue;
          }
          this.db.prepare(`DELETE FROM moodle_${table} WHERE id=?`).run(row.id);
        }
      };
      prune('deadlines',new Set(snapshot.deadlines.map(item => item.id)));
      for (const reminder of this.reminders()) if (reminder.orphaned && snapshot.deadlines.some(item => item.id === reminder.deadlineId)) this.db.prepare('UPDATE moodle_reminders SET data=? WHERE id=?').run(JSON.stringify({...reminder,orphaned:false}),reminder.id);
      prune('notifications',new Set(snapshot.notifications.map(item => item.value.id)));
      prune('grades',new Set(snapshot.grades.map(item => remoteId(accountId,'grade',`${item.value.courseId}:${item.remoteKey}`))));
      prune('files',new Set(snapshot.files.map(item => item.value.id)));
      prune('courses',courseIds);
      this.saveAccount({...account,status:'connected',syncedAt:new Date().toISOString()});
      this.db.exec('RELEASE moodle_sync');
    } catch (error) { this.db.exec('ROLLBACK TO moodle_sync; RELEASE moodle_sync'); throw error; }
  }
  notificationRecords(accountId: string) {
    return this.db.prepare('SELECT data,remoteId FROM moodle_notifications WHERE accountId=?').all(accountId).map(row => ({remoteId:z.number().int().parse(row.remoteId),value:moodleNotificationSchema.parse(JSON.parse(payload.parse(row).data))}));
  }
  notification(id: string) { return this.rows('SELECT data FROM moodle_notifications WHERE id=?',moodleNotificationSchema,id)[0]; }
  markRead(id: string) {
    const item = this.notification(id);
    if (!item) throw new Error('Moodle notification not found');
    this.db.prepare('UPDATE moodle_notifications SET data=? WHERE id=?').run(JSON.stringify({...item,read:true,pendingRemoteRead:true}),id);
  }
  acknowledgeRead(id: string) {
    const item = this.notification(id);
    if (item) this.db.prepare('UPDATE moodle_notifications SET data=? WHERE id=?').run(JSON.stringify({...item,pendingRemoteRead:false}),id);
  }
  deadlines(ids: string[]) {
    return ids.map(id => {
      const item = this.rows('SELECT data FROM moodle_deadlines WHERE id=?',moodleDeadlineSchema,id)[0];
      if (!item) throw new Error('Moodle deadline not found');
      return item;
    });
  }
  reminders() { return this.rows('SELECT data FROM moodle_reminders',moodleReminderSchema); }
  createReminder(input: Pick<MoodleReminder,'deadlineId'|'remindAt'|'note'|'createdBy'>) {
    this.deadlines([input.deadlineId]);
    const item = moodleReminderSchema.parse({...input,id:randomUUID(),fired:false});
    this.db.prepare('INSERT INTO moodle_reminders(id,deadlineId,data) VALUES (?,?,?)').run(item.id,item.deadlineId,JSON.stringify(item));
    return item;
  }
  deleteReminder(id: string) { this.db.prepare('DELETE FROM moodle_reminders WHERE id=?').run(id); }
  fired(item: MoodleReminder) { this.db.prepare('UPDATE moodle_reminders SET data=? WHERE id=?').run(JSON.stringify({...item,fired:true}),item.id); }
}
