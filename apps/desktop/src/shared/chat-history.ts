/**
 * Define bounded conversation search, search results, and metadata edit contracts.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Search transport for local chat history. Snippet markers are plain text, never HTML. */
import { z } from 'zod';
import { conversationSchema, conversationIdSchema, documentIdSchema, messageIdSchema, providerIdSchema } from './domain';
/** Bounded literal history query with filters and a stable rank, timestamp, and ID cursor. */
export const chatSearchSchema = z.object({
  query: z.string().trim().max(300).default(''),
  scope: z.enum(['all', 'courses', 'documents', 'general']).default('all'),
  courseIds: z.array(z.string().uuid()).max(100).optional(),
  term: z.string().max(100).optional(),
  documentId: documentIdSchema.optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  role: z.enum(['user', 'assistant']).optional(),
  pinned: z.boolean().optional(), archived: z.boolean().optional(),
  hasAttachments: z.boolean().optional(), hasCitations: z.boolean().optional(),
  model: z.string().max(300).optional(), provider: providerIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(30),
  cursor: z.object({ rank: z.number().finite(), updatedAt: z.string(), id: conversationIdSchema }).strict().optional(),
}).strict().refine(q => !q.from || !q.to || q.from <= q.to, 'Invalid date range');
/** Public history result with inert snippet markers; snippet text must never be treated as HTML. */
export const chatHitSchema = z.object({
  id: conversationIdSchema, scope: z.enum(['document', 'course', 'general']),
  documentId: documentIdSchema.nullable(), courseId: z.string().uuid().nullable(),
  courseTitle: z.string().nullable(), courseColor: z.string().nullable(), term: z.string().nullable(),
  documentTitle: z.string().nullable(), title: z.string(), titleSnippet: z.string(),
  providerId: providerIdSchema, modelId: z.string(), createdAt: z.string(), updatedAt: z.string(),
  pinned: z.boolean(), archived: z.boolean(), hasAttachments: z.boolean(), hasCitations: z.boolean(),
  rank: z.number(), matches: z.array(z.object({ messageId: messageIdSchema, role: z.enum(['user', 'assistant', 'system']), snippet: z.string() }).strict()),
}).strict();
/** Editable conversation metadata. Absence preserves a field; deletion uses a separate boolean intent. */
export const chatPatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(), pinned: z.boolean().optional(),
  archived: z.boolean().optional(), deleted: z.boolean().optional(),
}).strict();
export const chatHistoryContract = {
  'chats:facets': { request: z.object({}).strict(), response: z.object({ courses: z.array(z.object({ id: z.string(), title: z.string(), term: z.string().nullable() })), documents: z.array(z.object({ id: documentIdSchema, title: z.string() })), models: z.array(z.string()) }) },
  'chats:get': { request: z.object({ conversationId: conversationIdSchema }).strict(), response: conversationSchema.nullable() },
  'chats:search': { request: chatSearchSchema, response: z.object({ items: z.array(chatHitSchema), nextCursor: z.object({ rank: z.number(), updatedAt: z.string(), id: conversationIdSchema }).strict().nullable() }).strict() },
  'chats:update': { request: z.object({ conversationId: conversationIdSchema, patch: chatPatchSchema }).strict(), response: z.object({ ok: z.literal(true) }).strict() },
};
export type ChatSearch = z.infer<typeof chatSearchSchema>;
export type ChatHit = z.infer<typeof chatHitSchema>;
export type ChatPatch = z.infer<typeof chatPatchSchema>;
