import { webChatProviderSchema } from './web-chat';
import { z } from 'zod';
import { documentIdSchema, conversationIdSchema } from './domain';
import { webviewTargetSchema, publicWebviewUrl } from './moodle-webview';
import { libraryQuerySchema, type LibraryQuery } from './library';

export const MAX_APP_TABS = 30;
export const TAB_STORAGE_KEY = 'vstudy-tabs-v1';
export const tabIdSchema = z.string().uuid();
export const tabRouteSchema = z.object({
  view: z.enum(['home', 'library', 'workspace', 'courses', 'history', 'review', 'exams', 'ai-chats', 'moodle', 'hosted-chat']),
  provider:webChatProviderSchema.optional(),
  accountId: z.string().uuid().optional(), target: webviewTargetSchema.transform(target=>target.kind==='page' ? {...target,url:publicWebviewUrl(target.url)} : target).optional(),
  documentId: documentIdSchema.optional(), conversationId: conversationIdSchema.optional(),
  messageId: z.string().max(200).optional(), courseId: z.string().max(200).optional(),
  query: libraryQuerySchema.partial().strict().transform((query): Partial<LibraryQuery> => Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined))).optional(), title: z.string().max(1000).optional(),
}).strict().refine(route=>route.view!=='moodle' || (!!route.accountId && !!route.target),'Moodle routes need an account and target').refine(route=>route.view!=='hosted-chat' || !!route.provider,'Hosted chat routes need a provider');
export const routeHistorySchema = z.object({
  entries: z.array(tabRouteSchema).min(1).max(50).readonly(), index: z.number().int().nonnegative(),
}).strict().refine(value => value.index < value.entries.length, 'History index out of range');
const scrollTop = z.number().finite().nonnegative().max(100_000_000);
const chat = {conversationId:conversationIdSchema.optional(),draft:z.string().max(100_000).optional()};
export const tabPresentationSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('hosted-chat'),provider:webChatProviderSchema,url:z.string().max(8192).transform(raw=>{try{const url=new URL(raw);url.search='';url.hash='';url.username='';url.password='';return url.protocol==='https:'?url.href:'';}catch{return '';}}).optional(),scrollTop}).strict(),
  z.object({ kind: z.literal('moodle'), accountId: z.string().uuid(), url: z.string().max(8192).transform(publicWebviewUrl), zoom: z.number().min(.5).max(2), scrollTop }).strict(),
  z.object({ kind: z.literal('app'), scrollTop, ...chat }).strict(),
  z.object({ kind: z.literal('document'), scrollTop, ...chat, readerMode:z.enum(['markdown','file']).optional(),pane:z.enum(['reading','chat']).optional(),paneSizes:z.array(z.number().min(0).max(100)).length(2).optional(),readerScrollTop:scrollTop.optional(), page: z.number().int().positive().optional(), anchor: z.string().max(1000).optional(), anchorOffset:z.number().finite().min(-100_000_000).max(100_000_000).optional(), version: z.string().max(200).optional() }).strict(),
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
