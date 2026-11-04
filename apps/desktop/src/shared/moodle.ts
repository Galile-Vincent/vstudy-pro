import { z } from "zod";
import { moodleCourseIdentitySchema, moodleSectionSchema, moodleAnnouncementSchema } from "./moodle-course";

const timestamp = z.string().datetime();

export const moodleSchoolSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    host: z.string().url().startsWith("https://"),
    login: z.enum(["sso-launch", "password"]),
  })
  .strict();
export type MoodleSchool = z.infer<typeof moodleSchoolSchema>;

export const moodleSiteUrlSchema = z.string().url().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && !value.endsWith('/'); } catch { return false; }
}, 'Expected an HTTPS Moodle root');

export const moodleAccountSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("connected"),
      id: z.string().uuid(),
      siteUrl: moodleSiteUrlSchema,
      siteName: z.string().min(1),
      remoteUserId: z.number().int(),
      displayName: z.string(),
      syncedAt: timestamp.nullable(),
    })
    .strict(),
  z
    .object({
      status: z.literal("expired"),
      id: z.string().uuid(),
      siteUrl: moodleSiteUrlSchema,
      siteName: z.string().min(1),
      remoteUserId: z.number().int(),
      displayName: z.string(),
      syncedAt: timestamp.nullable(),
    })
    .strict(),
]);
export type MoodleAccount = z.infer<typeof moodleAccountSchema>;

export const moodleCourseSchema = z
  .object({
    id: z.string().uuid(),
    accountId: moodleAccountSchema.options[0].shape.id,
    remoteId: z.number().int(),
    fullName: z.string(),
    shortName: z.string(),
    imageUrl: z.string().url().nullable(),
    progress: z.number().min(0).max(100).nullable(),
    startAt: timestamp.nullable(),
    endAt: timestamp.nullable(),
    favourite: z.boolean(),
    identity: moodleCourseIdentitySchema,
  })
  .strict();
export type MoodleCourse = z.infer<typeof moodleCourseSchema>;

export const moodleDeadlineSchema = z
  .object({
    id: z.string().uuid(),
    courseId: moodleCourseSchema.shape.id,
    title: z.string(),
    kind: z.enum(["assignment", "quiz", "event"]),
    dueAt: timestamp,
    url: z.string().url().nullable(),
    submitted: z.boolean().nullable(),
    orphaned: z.boolean().optional(),
  })
  .strict();
export type MoodleDeadline = z.infer<typeof moodleDeadlineSchema>;

export const moodleNotificationSchema = z
  .object({
    id: z.string().uuid(),
    accountId: moodleAccountSchema.options[0].shape.id,
    courseId: moodleCourseSchema.shape.id.nullable(),
    source: z.enum(["message","popup"]).optional(),
    subject: z.string(),
    body: z.string(),
    createdAt: timestamp,
    read: z.boolean(),
    pendingRemoteRead: z.boolean().optional(),
    url: z.string().url().nullable(),
  })
  .strict();
export type MoodleNotification = z.infer<typeof moodleNotificationSchema>;

export const moodleGradeItemSchema = z
  .object({
    courseId: moodleCourseSchema.shape.id,
    name: z.string(),
    grade: z.string().nullable(),
    max: z.number().nullable(),
    percentage: z.number().nullable(),
    gradedAt: timestamp.nullable(),
  })
  .strict();
export type MoodleGradeItem = z.infer<typeof moodleGradeItemSchema>;

export const moodleFileSchema = z
  .object({
    id: z.string().uuid(),
    courseId: moodleCourseSchema.shape.id,
    section: z.string(),
    module: z.string(),
    name: z.string(),
    mime: z.string(),
    size: z.number().int().nonnegative(),
    modifiedAt: timestamp.nullable(),
    documentId: z.string().uuid().nullable(),
  })
  .strict();
export type MoodleFile = z.infer<typeof moodleFileSchema>;

export const moodleReminderSchema = z
  .object({
    id: z.string().uuid(),
    deadlineId: moodleDeadlineSchema.shape.id,
    remindAt: timestamp,
    note: z.string(),
    createdBy: z.enum(["user", "agent"]),
    fired: z.boolean(),
    orphaned: z.boolean().optional(),
  })
  .strict();
export type MoodleReminder = z.infer<typeof moodleReminderSchema>;

export const moodleCourseDetailSchema = z
  .object({
    course: moodleCourseSchema,
    deadlines: z.array(moodleDeadlineSchema),
    notifications: z.array(moodleNotificationSchema),
    grades: z.array(moodleGradeItemSchema),
    files: z.array(moodleFileSchema),
    reminders: z.array(moodleReminderSchema),
    sections: z.array(moodleSectionSchema),
    announcements: z.array(moodleAnnouncementSchema),
  })
  .strict();
export type MoodleCourseDetail = z.infer<typeof moodleCourseDetailSchema>;

export const moodleOverviewSchema = z
  .object({
    accounts: z.array(moodleAccountSchema),
    courses: z.array(moodleCourseSchema),
    upcoming: z.array(moodleDeadlineSchema),
    otherNotifications: z.array(moodleNotificationSchema).optional(),
    unreadNotifications: z.number().int().nonnegative(),
  })
  .strict();
export type MoodleOverview = z.infer<typeof moodleOverviewSchema>;

export const moodleAgentActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create-reminder"),
      deadlineId: moodleDeadlineSchema.shape.id,
      remindAt: timestamp,
      note: z.string().max(280),
    })
    .strict(),
  z
    .object({
      type: z.literal("export-calendar"),
      deadlineIds: z.array(moodleDeadlineSchema.shape.id).min(1).max(50),
    })
    .strict(),
]);
export type MoodleAgentAction = z.infer<typeof moodleAgentActionSchema>;

export const moodleChannels = {
  schools: "moodle:schools",
  checkSite: "moodle:check-site",
  connect: "moodle:connect",
  disconnect: "moodle:disconnect",
  ssoState: "moodle:sso-state",
  ssoCancel: "moodle:sso-cancel",
  overview: "moodle:overview",
  sync: "moodle:sync",
  course: "moodle:course",
  openFile: "moodle:open-file",
  markRead: "moodle:mark-read",
  createReminder: "moodle:create-reminder",
  deleteReminder: "moodle:delete-reminder",
  exportCalendar: "moodle:export-calendar",
} as const;

export const moodleProviderSchema = z.object({name:z.string(),iconurl:z.string(),url:z.string().url()}).strict();
export const moodleAuthPlanSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('password')}).strict(),
  z.object({kind:z.literal('browser'),providers:z.array(moodleProviderSchema)}).strict(),
  z.object({kind:z.literal('embedded'),providers:z.array(moodleProviderSchema)}).strict(),
  z.object({kind:z.literal('unavailable'),reason:z.enum(['webservices-disabled','mobile-disabled','maintenance','unsupported-version'])}).strict(),
]);
export type AuthPlan = z.infer<typeof moodleAuthPlanSchema>;
export const moodleSiteCheckSchema = z.object({siteUrl:moodleSiteUrlSchema,siteName:z.string(),authPlan:moodleAuthPlanSchema,iconUrl:z.string().optional()}).strict();
export type MoodleSiteCheck = z.infer<typeof moodleSiteCheckSchema>;

export type MoodleSsoMode = 'external' | 'embedded';
