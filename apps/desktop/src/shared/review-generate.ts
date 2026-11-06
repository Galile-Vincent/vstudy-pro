import { z } from 'zod';
import { providerIdSchema } from './domain';
import { studyScopeSchema, studyResolvedScopeSchema, studyTestSchema, studyAnswersSchema, studyTestItemSchema } from './review-artifacts';
import { studyIdSchema as id, studyPageInputSchema, studyCursorSchema } from './review';
const text = z.string().min(1).max(240), ack = z.object({ ok: z.literal(true) }).strict();
export const reviewProgressChannel = 'review:progress';
export const reviewProgressSchema = z.object({ requestId: id, artifactId: id, stage: z.enum(['queued', 'resolving', 'generating', 'validating', 'ready', 'failed', 'interrupted']), completed: z.number().int().min(0).max(100), total: z.number().int().min(0).max(100), errorCode: z.string().max(120).nullable() }).strict();
export type ReviewProgress = z.infer<typeof reviewProgressSchema>;
export const artifactSchema = z.object({ id, courseId: id, kind: z.enum(['note', 'test']), title: text, scope: studyScopeSchema, resolvedScope: studyResolvedScopeSchema, status: z.enum(['generating', 'ready', 'failed', 'interrupted']), bodyMarkdown: z.string().max(262144).nullable(), test: studyTestSchema.nullable(), providerId: providerIdSchema, modelId: text, errorCode: z.string().max(120).nullable(), createdAt: z.string().datetime() }).strict();
// Renderer artifacts contain prompts only. Feedback is returned per committed item.
export const publicTestItemSchema = z.discriminatedUnion('type', [
 studyTestItemSchema.options[0].pick({id:true,conceptKey:true,stem:true,type:true,options:true,unitId:true,bloom:true,difficulty:true}),
 studyTestItemSchema.options[1].pick({id:true,conceptKey:true,stem:true,type:true,unitId:true,bloom:true,difficulty:true}),
 studyTestItemSchema.options[2].pick({id:true,conceptKey:true,stem:true,type:true,unitId:true,bloom:true,difficulty:true}),
]);
export const rendererArtifactSchema = artifactSchema.extend({test:z.object({version:z.literal(1),items:z.array(publicTestItemSchema).min(1).max(100),warnings:z.array(z.string()).optional(),validationNotice:z.string().optional()}).strict().nullable()});
export function rendererArtifact(artifact: z.infer<typeof artifactSchema>) {
 return rendererArtifactSchema.parse({...artifact,test:artifact.test ? {version:artifact.test.version,items:artifact.test.items.map(item=>publicTestItemSchema.parse(Object.fromEntries(Object.entries(item).filter(([key])=>['id','conceptKey','stem','type','options','unitId','bloom','difficulty'].includes(key))))),warnings:artifact.test.warnings,validationNotice:artifact.test.validationNotice} : null});
}
export const generationRequestSchema = z.object({ requestId: id, courseId: id, kind: z.enum(['note', 'test']), title: text, scope: studyScopeSchema, idempotencyKey: text, providerId: providerIdSchema, modelId: text, locale: z.enum(['en', 'zh-Hant']).default('en'), size: z.enum(['short','standard','long']).optional(), retakeAttemptId: id.optional() }).strict();
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export const attemptSchema = z.object({ id, artifactId: id, phase: z.enum(['answering', 'committed', 'graded', 'confirmed']), answers: studyAnswersSchema, startedAt: z.string().datetime(), committedAt: z.string().datetime().nullable(), confirmedAt: z.string().datetime().nullable(), results: z.array(z.object({ itemId: text, conceptKey: text, correct: z.boolean().nullable(), reportedBad: z.boolean(), feedback: studyTestItemSchema.optional() }).strict()).max(100) }).strict();
export const reviewGenerateIpc = {
    'review:artifact:generate': { request: generationRequestSchema, response: rendererArtifactSchema },
    'review:artifact:retry': { request: z.object({ artifactId: id, requestId: id, locale: z.enum(['en', 'zh-Hant']).default('en') }).strict(), response: rendererArtifactSchema },
    'review:artifact:cancel': { request: z.object({ artifactId: id }).strict(), response: ack },
    'review:artifact:list': { request: studyPageInputSchema.extend({ courseId: id }), response: z.object({ items: z.array(artifactSchema.omit({ bodyMarkdown: true, test: true })).max(100), nextCursor: studyCursorSchema.nullable() }).strict() },
    'review:artifact:get': { request: z.object({ artifactId: id }).strict(), response: rendererArtifactSchema.nullable() },
    'review:artifact:delete': { request: z.object({ artifactId: id }).strict(), response: ack },
    'review:artifact:export': { request: z.object({ artifactId: id }).strict(), response: z.object({ saved: z.boolean() }).strict() },
    'review:attempt:get': { request: z.object({ attemptId: id }).strict(), response: attemptSchema },
    'review:attempt:start': { request: z.object({ artifactId: id }).strict(), response: attemptSchema },
    'review:attempt:answer': { request: z.object({ attemptId: id, itemId: text, answer: z.union([z.string().max(2000), z.number().int().min(0).max(5), z.boolean(), z.null()]) }).strict(), response: attemptSchema },
    'review:attempt:commit': { request: z.object({ attemptId: id, itemId: text.optional() }).strict(), response: attemptSchema },
    'review:attempt:confirm': { request: z.object({ attemptId: id }).strict(), response: attemptSchema },
    'review:attempt:report-bad': { request: z.object({ attemptId: id, itemId: text }).strict(), response: attemptSchema },
} as const;
