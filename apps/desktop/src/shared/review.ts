import { z } from 'zod';
export const studyIdSchema = z.string().uuid();
const title = z.string().trim().min(1).max(240);
const at = z.string().datetime();
export const studyPrefsSchema = z.object({ memoryEnabled: z.boolean().default(true), noticeAcknowledged: z.boolean().default(false), timeZone: z.string().min(1).max(100).refine(zone => { try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
    }
    catch {
        return false;
    } }).default('UTC') }).strict();
export type StudyPrefs = z.infer<typeof studyPrefsSchema>;
export const studyCourseSchema = z.object({ id: studyIdSchema, title, aliases: z.array(title).max(50), moodleCourseId: studyIdSchema.nullable(), createdAt: at, archivedAt: at.nullable() }).strict();
export const studyUnitSchema = z.object({ id: studyIdSchema, courseId: studyIdSchema, kind: z.enum(['moodle', 'document', 'manual']), ordinal: z.number().int(), title, sourceKey: z.string().min(1).max(240), sourceSectionId: z.string().nullable(), startsAt: at.nullable(), endsAt: at.nullable() }).strict();
export const studyConceptSchema = z.object({ id: studyIdSchema, courseId: studyIdSchema, key: title, label: title, source: z.enum(['heading', 'user', 'promoted']), unitId: studyIdSchema.nullable(), userState: z.enum(['none', 'dismissed']), note: z.string().max(240).nullable(), createdAt: at }).strict();
export const studyObservationSchema = z.object({ id: studyIdSchema, jobId: studyIdSchema, courseId: studyIdSchema, unitId: studyIdSchema.nullable(), conceptKey: title.nullable(), proposedLabel: title.nullable(), errorType: z.enum(['none', 'slip', 'mistake', 'misconception', 'gap']), signal: z.enum(['asked', 'confused', 'wrong', 'gave_up', 'resolved']), evidenceQuote: z.string().max(240), evidenceKind: z.enum(['quote', 'paraphrase']), weaknessNote: z.string().max(240).nullable(), confidence: z.number().min(0).max(1), dismissed: z.boolean(), resolved: z.boolean(), wrongAttempt: z.boolean(), createdAt: at, occurredAt: at, conversationId: studyIdSchema, userMessageId: studyIdSchema, assistantMessageId: studyIdSchema, questionSummary: z.string().max(240).nullable() }).strict();
export const studyChatLinkSchema = z.object({ conversationId: studyIdSchema, courseId: studyIdSchema.nullable(), method: z.enum(['scope', 'document', 'alias', 'model', 'manual']), confidence: z.number().min(0).max(1), confirmed: z.boolean(), excludeFromMemory: z.boolean(), revision: z.number().int().nonnegative(), updatedAt: at }).strict();
export const studyCursorSchema = z.object({ at, id: studyIdSchema }).strict();
export const studyPageInputSchema = z.object({ limit: z.number().int().min(1).max(100).default(50), cursor: studyCursorSchema.optional() }).strict();
export type StudyPageInput = z.input<typeof studyPageInputSchema>;
const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item).max(100), nextCursor: studyCursorSchema.nullable() }).strict();
const empty = z.object({}).strict(), ack = z.object({ ok: z.literal(true) }).strict();
const courseId = z.object({ courseId: studyIdSchema }).strict(), conceptId = z.object({ conceptId: studyIdSchema }).strict();
export const studyCourseInputSchema = z.object({ title, aliases: z.array(title).max(50).default([]) }).strict();
export const studyConceptInputSchema = z.object({ courseId: studyIdSchema, label: title, unitId: studyIdSchema.nullable().default(null), note: z.string().max(240).nullable().default(null) }).strict();
export const reviewIpc = {
    'review:courses:create': { request: studyCourseInputSchema, response: studyCourseSchema },
    'review:courses:update': { request: courseId.extend({ changes: studyCourseInputSchema.partial() }), response: studyCourseSchema },
    'review:courses:list': { request: studyPageInputSchema.extend({ includeArchived: z.boolean().default(false) }), response: page(studyCourseSchema) },
    'review:courses:get': { request: courseId, response: studyCourseSchema.nullable() },
    'review:courses:archive': { request: courseId.extend({ archived: z.boolean() }), response: ack },
    'review:courses:link-moodle': { request: courseId.extend({ moodleCourseId: studyIdSchema.nullable() }), response: studyCourseSchema },
    'review:courses:materialize': { request: z.object({ moodleCourseId: studyIdSchema }).strict(), response: studyCourseSchema },
    'review:courses:mastery': { request: studyPageInputSchema.extend({ courseId: studyIdSchema }), response: page(studyConceptSchema.extend({ mastery: z.object({ state: z.enum(['candidate', 'watching', 'needs_review', 'dismissed']), risk: z.number(), negative: z.number(), positive: z.number(), episodeCount: z.number().int().nonnegative() }).strict() })) },
    'review:courses:units': { request: studyPageInputSchema.extend({ courseId: studyIdSchema }), response: page(studyUnitSchema) },
    'review:docs:link': { request: courseId.extend({ documentId: studyIdSchema }), response: ack },
    'review:docs:unlink': { request: courseId.extend({ documentId: studyIdSchema }), response: ack },
    'review:chat:assign': { request: z.object({ conversationId: studyIdSchema, courseId: studyIdSchema.nullable() }).strict(), response: studyChatLinkSchema },
    'review:chat:exclude': { request: z.object({ conversationId: studyIdSchema, excluded: z.boolean() }).strict(), response: studyChatLinkSchema },
    'review:chat:inbox': { request: studyPageInputSchema, response: page(studyChatLinkSchema) },
    'review:concepts:list': { request: studyPageInputSchema.extend({ courseId: studyIdSchema }), response: page(studyConceptSchema) },
    'review:concepts:add': { request: studyConceptInputSchema, response: studyConceptSchema },
    'review:concepts:edit': { request: conceptId.extend({ changes: z.object({ label: title.optional(), note: z.string().max(240).nullable().optional() }).strict() }), response: studyConceptSchema },
    'review:concepts:dismiss': { request: conceptId, response: ack },
    'review:concepts:restore': { request: conceptId, response: ack },
    'review:concepts:understood': { request: conceptId, response: ack },
    'review:observations:page': { request: studyPageInputSchema.extend({ courseId: studyIdSchema }), response: page(studyObservationSchema) },
    'review:observations:edit': { request: z.object({ observationId: studyIdSchema, changes: z.object({ weaknessNote: z.string().max(240).nullable().optional(), dismissed: z.boolean().optional(), resolved: z.boolean().optional() }).strict() }).strict(), response: ack },
    'review:observations:delete': { request: z.object({ observationId: studyIdSchema }).strict(), response: ack },
    'review:prefs:get': { request: empty, response: studyPrefsSchema },
    'review:prefs:set': { request: studyPrefsSchema.partial(), response: studyPrefsSchema },
    'review:prefs:erase': { request: empty, response: ack },
} as const;
