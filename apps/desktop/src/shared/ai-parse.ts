/**
 * Define validated AI conversion requests, estimates, progress, and persisted page state.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { z } from 'zod';
import { documentIdSchema, providerIdSchema, modelOptionsSchema } from './domain';
export const aiParseOptionsSchema = z.object({ concurrency:z.number().int().min(1).max(4).default(2), hardCapUsd:z.number().positive().max(100).optional(), confirmBudgetOverride:z.boolean().default(false), modelOptions:modelOptionsSchema.default({}) }).strict();
export const aiParseRequestSchema = z.object({ documentId:documentIdSchema, providerId:providerIdSchema, modelId:z.string().min(1).max(300), options:aiParseOptionsSchema.default({}), scope:z.enum(['all','range','currentPage','preview']).default('all'), startPage:z.number().int().positive().optional(), endPage:z.number().int().positive().optional() }).strict();
export type AiParseRequest = z.infer<typeof aiParseRequestSchema>;
export const aiParsePageSchema = z.object({ page:z.number().int().positive(), status:z.enum(['pending','running','done','kept-original','failed']), code:z.string().optional() }).strict();
export const aiParseStateSchema = z.object({ documentId:documentIdSchema, status:z.enum(['idle','running','cancelled','complete']), code:z.literal('ai_parse.publish_failed').optional(), activeVersion:z.enum(['original','ai']), pages:z.array(aiParsePageSchema), providerId:providerIdSchema.optional(), modelId:z.string().optional(), promptVersion:z.string().optional(), updatedAt:z.string().optional() }).strict();
export type AiParseState = z.infer<typeof aiParseStateSchema>;
export const aiParseEstimateSchema = z.object({ pages:z.number(), inputTokens:z.number(), outputTokens:z.number(), costUsd:z.number().optional(), billing:z.enum(['api','api-equivalent']), supportsImages:z.boolean(), reason:z.string().optional() }).strict();
export type AiParseEstimate = z.infer<typeof aiParseEstimateSchema>;
const documentRequest = z.object({documentId:documentIdSchema}).strict();
const ack = z.object({ok:z.literal(true)}).strict();
export const aiParseContract = {
 'aiParse:estimate':{request:aiParseRequestSchema,response:aiParseEstimateSchema},
 'aiParse:start':{request:aiParseRequestSchema,response:aiParseStateSchema},
 'aiParse:status':{request:documentRequest,response:aiParseStateSchema},
 'aiParse:cancel':{request:documentRequest,response:ack},
 'aiParse:use':{request:documentRequest.extend({version:z.enum(['original','ai'])}),response:ack},
 'aiParse:discard':{request:documentRequest,response:ack},
};
export const aiParseProgressChannel = 'aiParse:progress';
