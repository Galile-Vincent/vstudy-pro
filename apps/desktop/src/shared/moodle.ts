import { z } from "zod";

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

export const moodleAccountSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("connected"),
      id: z.string().uuid(),
      schoolId: moodleSchoolSchema.shape.id,
      remoteUserId: z.number().int(),
      displayName: z.string(),
      syncedAt: timestamp.nullable(),
    })
    .strict(),
  z
    .object({
      status: z.literal("expired"),
      id: z.string().uuid(),
      schoolId: moodleSchoolSchema.shape.id,
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
    submitted: z.boolean(),
  })
  .strict();
export type MoodleDeadline = z.infer<typeof moodleDeadlineSchema>;

export const moodleNotificationSchema = z
  .object({
    id: z.string().uuid(),
    accountId: moodleAccountSchema.options[0].shape.id,
    courseId: moodleCourseSchema.shape.id.nullable(),
    subject: z.string(),
    body: z.string(),
    createdAt: timestamp,
    read: z.boolean(),
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
  })
  .strict();
export type MoodleCourseDetail = z.infer<typeof moodleCourseDetailSchema>;

export const moodleOverviewSchema = z
  .object({
    accounts: z.array(moodleAccountSchema),
    courses: z.array(moodleCourseSchema),
    upcoming: z.array(moodleDeadlineSchema),
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
  connect: "moodle:connect",
  disconnect: "moodle:disconnect",
  overview: "moodle:overview",
  sync: "moodle:sync",
  course: "moodle:course",
  openFile: "moodle:open-file",
  markRead: "moodle:mark-read",
  createReminder: "moodle:create-reminder",
  deleteReminder: "moodle:delete-reminder",
  exportCalendar: "moodle:export-calendar",
} as const;
