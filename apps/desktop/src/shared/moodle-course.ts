import { z } from "zod";

const timestamp = z.string().datetime();

export const moodleLifecycleSchema = z.enum(["past", "current", "future", "unknown"]);
export type MoodleLifecycle = z.infer<typeof moodleLifecycleSchema>;

export const moodleLifecycleSourceSchema = z.enum(["server", "dates", "term", "none"]);
export type MoodleLifecycleSource = z.infer<typeof moodleLifecycleSourceSchema>;

const localized = z.object({ zh: z.string().nullable(), en: z.string().nullable() }).strict();

export const moodleCourseIdentitySchema = z
  .object({
    title: localized,
    teachers: z.array(z.object({ zh: z.string().nullable(), en: z.string().nullable() }).strict()),
    code: z.string().nullable(),
    term: z.string().regex(/^\d{3,4}$/).nullable(),
    classLabel: localized,
    lifecycle: moodleLifecycleSchema,
    lifecycleSource: moodleLifecycleSourceSchema,
    hidden: z.boolean(),
    hasProgress: z.boolean(),
    format: z.string().nullable(),
    summaryHtml: z.string().nullable(),
  })
  .strict();
export type MoodleCourseIdentity = z.infer<typeof moodleCourseIdentitySchema>;

export const moodleModuleKindSchema = z.enum([
  "resource", "folder", "url", "page", "label", "forum", "assign", "quiz", "h5p", "video", "subsection", "other",
]);
export type MoodleModuleKind = z.infer<typeof moodleModuleKindSchema>;

export const moodleCompletionSchema = z.enum(["none", "incomplete", "complete", "pass", "fail"]);
export type MoodleCompletion = z.infer<typeof moodleCompletionSchema>;

export const moodleModuleSchema = z
  .object({
    id: z.string().uuid(),
    cmid: z.number().int(),
    kind: moodleModuleKindSchema,
    modname: z.string(),
    name: z.string(),
    descriptionHtml: z.string().nullable(),
    url: z.string().url().nullable(),
    accessible: z.boolean(),
    completion: moodleCompletionSchema,
    dueAt: timestamp.nullable(),
    submitted: z.boolean().nullable(),
    fileIds: z.array(z.string().uuid()),
  })
  .strict();
export type MoodleModule = z.infer<typeof moodleModuleSchema>;

export const moodleSectionSchema = z
  .object({
    id: z.string().uuid(),
    number: z.number().int().nonnegative(),
    name: z.string(),
    summaryHtml: z.string().nullable(),
    accessible: z.boolean(),
    current: z.boolean(),
    weekStart: timestamp.nullable(),
    modules: z.array(moodleModuleSchema),
  })
  .strict();
export type MoodleSection = z.infer<typeof moodleSectionSchema>;

export const moodleAnnouncementSchema = z
  .object({
    id: z.string().uuid(),
    subject: z.string(),
    author: z.string(),
    createdAt: timestamp,
    bodyHtml: z.string(),
    url: z.string().url().nullable(),
  })
  .strict();
export type MoodleAnnouncement = z.infer<typeof moodleAnnouncementSchema>;

export const moodleCourseExtrasSchema = z
  .object({
    identity: moodleCourseIdentitySchema,
    sections: z.array(moodleSectionSchema),
    announcements: z.array(moodleAnnouncementSchema),
  })
  .strict();
export type MoodleCourseExtras = z.infer<typeof moodleCourseExtrasSchema>;

export const moodleTermFilterSchema = z.enum(["current", "future", "past", "all"]);
export type MoodleTermFilter = z.infer<typeof moodleTermFilterSchema>;

export function emptyCourseIdentity(title: string, hasProgress = false): MoodleCourseIdentity {
  return {title:{zh:/[\u3400-\u9fff]/.test(title) ? title : null,en:/[\u3400-\u9fff]/.test(title) ? null : title},teachers:[],code:null,term:null,classLabel:{zh:null,en:null},lifecycle:'unknown',lifecycleSource:'none',hidden:false,hasProgress,format:null,summaryHtml:null};
}
