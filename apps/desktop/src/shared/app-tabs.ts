import { z } from 'zod';
import { documentIdSchema, conversationIdSchema } from './domain';
import { libraryQuerySchema, type LibraryQuery } from './library';

export const MAX_APP_TABS = 30;
export const TAB_STORAGE_KEY = 'vstudy-tabs-v1';
export const tabIdSchema = z.string().uuid();
export const tabRouteSchema = z.object({
  view: z.enum(['home', 'library', 'workspace', 'courses', 'history', 'review', 'exams', 'ai-chats']),
  documentId: documentIdSchema.optional(), conversationId: conversationIdSchema.optional(),
  messageId: z.string().max(200).optional(), courseId: z.string().max(200).optional(),
  query: libraryQuerySchema.partial().strict().transform((query): Partial<LibraryQuery> => Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined))).optional(), title: z.string().max(1000).optional(),
}).strict();
export const routeHistorySchema = z.object({
  entries: z.array(tabRouteSchema).min(1).max(50).readonly(), index: z.number().int().nonnegative(),
}).strict().refine(value => value.index < value.entries.length, 'History index out of range');
const scrollTop = z.number().finite().nonnegative();
export const tabPresentationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('app'), scrollTop }).strict(),
  z.object({ kind: z.literal('document'), scrollTop, page: z.number().int().positive().optional(), anchor: z.string().max(1000).optional(), version: z.string().max(200).optional() }).strict(),
]);
export const tabStateSchema = z.object({
  id: tabIdSchema, history: routeHistorySchema, title: z.string().max(1000),
  icon: z.enum(['Home', 'BookOpen', 'FileText', 'GraduationCap', 'History', 'ClipboardCheck']),
  lastActiveAt: z.number().finite().nonnegative(), presentation: tabPresentationSchema,
}).strict();
export const tabSetSchema = z.object({
  version: z.literal(1), activeId: tabIdSchema, tabs: z.array(tabStateSchema).min(1).max(MAX_APP_TABS),
}).strict().refine(value => new Set(value.tabs.map(tab => tab.id)).size === value.tabs.length && value.tabs.some(tab => tab.id === value.activeId), 'Invalid tab identity');
export type TabRoute = z.infer<typeof tabRouteSchema>;
export type TabId = z.infer<typeof tabIdSchema>;
export type TabPresentation = z.infer<typeof tabPresentationSchema>;
export type TabState = z.infer<typeof tabStateSchema>;
export type TabSet = z.infer<typeof tabSetSchema>;
