import { updatesContract, type UpdateSnapshot } from './updates';
import { subscriptionUsageSchema } from './subscription-usage';
import { webChatContract, type WebChatProvider } from './web-chat';
import { reviewGenerateIpc, type ReviewProgress } from './review-generate';
import { newsletterContract } from './newsletter';
import { analyticsContract } from './analytics';
/**
 * Define the validated request, response, and event contracts exposed by preload.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { reviewIpc } from "./review";
import { aiCliContract } from "./ai-cli";
import { storageContract } from "./storage";
import { chatHistoryContract } from './chat-history';
import { moodlePanelSchema, moodleSiteCheckSchema, moodleSiteUrlSchema, moodleChannels, moodleSchoolSchema, moodleAccountSchema, moodleOverviewSchema, moodleCourseDetailSchema, moodleReminderSchema } from './moodle';
import { plannerIpc } from "./planner";
import { mcpIpc } from './mcp';
import { mcpNavigationIpc } from './mcp-navigation';
import { aiParseContract } from './ai-parse';
import { moodleWebviewContract } from './moodle-webview';
import { statusSchema } from "./status";
import { folderIdSchema, libraryContract } from "./library";
import { z } from "zod";
import {
  modelSchema, modelOptionsSchema,
  chatEventSchema,
  chatRequestSchema,
  conversationIdSchema,
  conversationSchema, conversationCreateSchema, conversationScopeSchema,
  documentContextAttachmentSchema,
  documentIdSchema,
  documentSchema,
  messageSchema,
  providerConfigSchema,
  providerIdSchema,
  requestIdSchema,
  settingsSchema, settingsPatchSchema, usageDashboardSchema, usagePeriodSchema, usageSchema, usageSummarySchema, usageRecordSchema, rateLimitSchema,
} from "./domain";

const empty = z.object({}).strict();
const ack = z.object({ ok: z.literal(true) }).strict();
/** Allowed browser and mail destinations; opening still requires native confirmation. */
export const externalUrlSchema = z.string().max(8192).url().refine((value) => {
  if ([...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || value.includes("\\")) return false;
  try { return ["http:", "https:", "mailto:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Only http, https and mailto URLs are allowed");
/** Source of request and response types for the narrow preload bridge. Every main handler validates both directions. */
export const ipcContract = {
  ...updatesContract,
  'documents:originalPage': {request:z.object({documentId:documentIdSchema,page:z.number().int().min(1).max(10000)}).strict(),response:z.object({image:documentContextAttachmentSchema.shape.image,previewOnly:z.boolean()}).strict()},
  'documents:copyContext': {request:documentContextAttachmentSchema,response:ack},
  'app:reportError': { request: z.object({phase:z.enum(['render','bootstrap']),code:z.string().max(100),componentStack:z.string().max(4000).optional()}).strict(), response:ack },
  ...reviewIpc,
  ...reviewGenerateIpc,
  ...analyticsContract,
  ...newsletterContract,
  ...mcpIpc,
  ...mcpNavigationIpc,
  ...aiCliContract,
  ...plannerIpc,
  ...aiParseContract,
  ...moodleWebviewContract,
  ...webChatContract,
  ...storageContract,
  ...chatHistoryContract,
  [moodleChannels.schools]: {request:empty,response:z.array(moodleSchoolSchema)},
  [moodleChannels.checkSite]: {request:z.object({url:z.string().min(1).max(2048)}).strict(),response:moodleSiteCheckSchema},
  [moodleChannels.preflight]: {request:z.object({}).strict(),response:z.object({ready:z.boolean()}).strict()},
  [moodleChannels.retrySave]: {request:z.object({accountId:z.string().uuid()}).strict(),response:ack},
  [moodleChannels.connect]: {request:z.object({siteUrl:moodleSiteUrlSchema,storage:z.enum(['secure','session']).optional(),provider:z.number().int().nonnegative().optional(),username:z.string().min(1).max(256).optional(),password:z.string().min(1).max(4096).optional()}).strict(),response:moodleAccountSchema},
  [moodleChannels.ssoState]: {request:z.object({siteUrl:moodleSiteUrlSchema}).strict(),response:z.enum(['external','embedded']).nullable()},
  [moodleChannels.ssoCancel]: {request:z.object({siteUrl:moodleSiteUrlSchema}).strict(),response:ack},
  [moodleChannels.disconnect]: {request:z.object({accountId:z.string().uuid()}).strict(),response:ack},
  [moodleChannels.overview]: {request:z.object({accountId:z.string().uuid().optional()}).strict(),response:moodleOverviewSchema},
  [moodleChannels.sync]: {request:z.object({accountId:z.string().uuid().optional()}).strict(),response:moodleOverviewSchema.extend({errors:z.array(z.string())})},
  [moodleChannels.course]: {request:z.object({courseId:z.string().uuid(),refresh:z.boolean().optional()}).strict(),response:moodleCourseDetailSchema},
  [moodleChannels.openFile]: {request:z.object({fileId:z.string().uuid()}).strict(),response:documentIdSchema},
  [moodleChannels.setPinned]: {request:z.object({accountId:z.string().uuid(),courseId:z.string().uuid(),pinned:z.boolean()}).strict(),response:ack},
  [moodleChannels.markRead]: {request:z.object({notificationId:z.string().uuid(),read:z.boolean().optional()}).strict(),response:ack},
  [moodleChannels.createReminder]: {request:moodleReminderSchema.omit({id:true,fired:true}),response:moodleReminderSchema},
  [moodleChannels.deleteReminder]: {request:z.object({reminderId:z.string().uuid()}).strict(),response:ack},
  [moodleChannels.exportCalendar]: {request:z.object({deadlineIds:z.array(z.string().uuid()).min(1).max(50)}).strict(),response:z.object({saved:z.boolean()}).strict()},
  "secrets:unlock": {request:z.object({providerId:providerIdSchema}).strict(),response:ack},
  "secrets:session": {request:z.object({providerId:providerIdSchema,key:z.string().min(1).max(16384)}).strict(),response:ack},
  "converter:mode": {request:z.object({offline:z.boolean()}).strict(),response:ack},
  "settings:networkActivity": {request:empty,response:z.array(z.object({at:z.string().datetime(),what:z.string(),to:z.string()}).strict())},
  "providers:chooseExecutable": {request:z.object({binary:z.enum(['claude','codex','agy'])}).strict(),response:z.object({path:z.string().nullable()}).strict()},
  "settings:deleteAllData": { request: z.object({confirmation:z.literal("DELETE")}).strict(), response: ack },
  "settings:appearance": { request: empty, response: z.object({ reducedTransparency:z.boolean() }).strict() },
  "settings:systemLocale": { request: empty, response: z.string().max(100) },
  ...libraryContract,
  "usage:dashboard": { request: z.object({ period: usagePeriodSchema }).strict(), response: usageDashboardSchema },
  "usage:estimate": { request: z.object({ conversationId: conversationIdSchema, userMessage: z.string().max(2_000_000) }).strict(), response: usageSchema },
  "usage:summary": { request: z.object({ period: z.enum(['day', 'month', 'last30days']) }).strict(), response: usageSummarySchema },
  "usage:forConversation": { request: z.object({ conversationId: conversationIdSchema }).strict(), response: z.array(usageRecordSchema) },
  "usage:forDocument": { request: z.object({ documentId: documentIdSchema }).strict(), response: z.array(usageRecordSchema) },
  "usage:subscriptions": { request: z.object({ refresh: z.boolean().optional(), allowClaudeKeychain: z.boolean().optional() }).strict(), response: z.array(subscriptionUsageSchema) },
  "usage:rateLimits": { request: empty, response: z.array(z.object({ providerId: providerIdSchema, createdAt: z.string().datetime(), rateLimit: rateLimitSchema })) },
  "usage:export": { request: empty, response: z.object({ saved: z.boolean() }).strict() },
  "shell:openExternal": {
    request: z.object({ url: externalUrlSchema }).strict(),
    response: ack,
  },
  "welcome:sampleDocument": { request: z.object({ language: z.enum(["en", "zh-Hant", "ja"]) }).strict(), response: z.string().max(100_000) },
  "documents:importSample": { request: z.object({ language: z.enum(["en", "zh-Hant", "ja"]) }).strict(), response: documentSchema },
  "documents:import": { request: z.object({ folderId: folderIdSchema.nullable().optional() }).strict(), response: documentSchema.nullable() },
  "documents:importPaths": {
    request: z.object({ paths: z.array(z.string().regex(/^drop:[a-f0-9]{64}$/)).min(1).max(100), folderId: folderIdSchema.nullable().optional() }).strict(),
    response: z.array(z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), document: documentSchema }), z.object({ ok: z.literal(false), path: z.string(), error: z.string() })])),
  },
  "documents:list": { request: empty, response: z.array(documentSchema) },
  "documents:get": {
    request: z.object({ documentId: documentIdSchema }).strict(),
    response: documentSchema.nullable(),
  },
  "documents:read": {
    request: z.object({ documentId: documentIdSchema, version:z.enum(["original","ai"]).optional() }).strict(),
    response: z.string(),
  },
  "documents:reconvert": {request:z.object({documentId:documentIdSchema}).strict(),response:documentSchema},
  "documents:retry": {
    request: z.object({ documentId: documentIdSchema }).strict(),
    response: documentSchema,
  },
  "documents:delete": {
    request: z.object({ documentId: documentIdSchema }).strict(),
    response: ack,
  },
  "conversations:create": {
    request: conversationCreateSchema,
    response: conversationSchema,
  },
  "conversations:model": { request: z.object({ conversationId: conversationIdSchema, providerId: providerIdSchema, modelId: z.string().min(1) }).strict(), response: conversationSchema },
  "conversations:options": { request: z.object({ conversationId: conversationIdSchema, options: modelOptionsSchema }).strict(), response: ack },
  "conversations:list": {
    request: conversationScopeSchema,
    response: z.array(conversationSchema),
  },
  "conversations:delete": {
    request: z.object({ conversationId: conversationIdSchema }).strict(),
    response: ack,
  },
  "messages:list": {
    request: z.object({ conversationId: conversationIdSchema }).strict(),
    response: z.array(messageSchema),
  },
  "settings:get": { request: empty, response: settingsSchema },
  "settings:set": { request: settingsPatchSchema, response: settingsSchema },
  "providers:list": {
    request: z.object({ discover: z.boolean().optional() }).strict(),
    response: z.array(
      z.object({
        config: providerConfigSchema,
        availability: z.discriminatedUnion("available", [
          z.object({ available: z.literal(true) }),
          z.object({ available: z.literal(false), reason: z.string() }),
        ]),
        resolvedPath: z.string().nullable().optional(),
        modelsLoading: z.boolean().optional(),
        models: z.array(modelSchema),
      }),
    ),
  },
  "providers:test": { request: z.object({ providerId: z.enum(["anthropic-api", "openai-api", "openai-compatible"]) }).strict(), response: z.enum(["success", "bad_key", "offline", "no_access"]) },
  "providers:configure": { request: providerConfigSchema, response: ack },
  "secrets:set": {
    request: z
      .object({
        providerId: providerIdSchema,
        key: z.string().min(1).max(16384),
      })
      .strict(),
    response: ack,
  },
  "secrets:has": {
    request: z.object({ providerId: providerIdSchema }).strict(),
    response: z
      .object({ providerId: providerIdSchema, hasKey: z.boolean() })
      .strict(),
  },
  "secrets:delete": {
    request: z.object({ providerId: providerIdSchema }).strict(),
    response: ack,
  },
  "chat:start": { request: chatRequestSchema, response: ack },
  "chat:abort": {
    request: z.object({ requestId: requestIdSchema }).strict(),
    response: ack,
  },
} satisfies Record<string, { request: z.ZodTypeAny; response: z.ZodTypeAny }>;
export type IpcChannel = keyof typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<
  (typeof ipcContract)[C]["request"]
>;
export type IpcResponse<C extends IpcChannel> = z.infer<
  (typeof ipcContract)[C]["response"]
>;
export const documentProgressChannel = "documents:progress";
/** Conversion progress is a validated event rather than an invoke result. */
export const documentProgressSchema = z.object({ documentId: documentIdSchema, code:statusSchema.shape.code.optional(), params:statusSchema.shape.params.optional(), message: z.string().min(1).max(200) }).strict();
export const historyChangedChannel = "vstudy:history-changed";
export const historyChangedArgumentsSchema = z.tuple([]);
export const chatEventChannel = "chat:events";
/** Multiplex streams on a fixed event channel and filter by validated request ID. */
export const chatEnvelopeSchema = z
  .object({ requestId: requestIdSchema, event: chatEventSchema })
  .strict();
export type ChatEnvelope = z.infer<typeof chatEnvelopeSchema>;
export const nativeTabShortcutChannel='navigation:tab-shortcut';
export const nativeTabShortcutSchema=z.enum(['new','close','previous','next','1','2','3','4','5','6','7','8','9']);
export type NativeTabShortcut=z.infer<typeof nativeTabShortcutSchema>;
export const trackpadScrollBeginChannel = "navigation:scroll-begin";
export const trackpadScrollEndChannel = "navigation:scroll-end";
export const trackpadEventArgumentsSchema = z.tuple([]);

/** Renderer capability boundary. Invoke only declared channels and unsubscribe event listeners on teardown. */
export interface DesktopApi {
  onUpdateState?(listener: (snapshot: UpdateSnapshot) => void): () => void;
  onWebChatCleared?(listener:(provider:WebChatProvider)=>void):()=>void;
  onNativeTabShortcut?(listener:(shortcut:NativeTabShortcut)=>void):()=>void;
  onReviewProgress(listener:(event:ReviewProgress)=>void):()=>void;
  onDraftFlushRequest?(listener:()=>Promise<'clean' | 'pending'>):()=>void;
  onTrackpadScrollBegin?(listener: () => void): () => void;
  onTrackpadScrollEnd?(listener: () => void): () => void;
  onMoodleProgress?(listener:(event:MoodleProgress)=>void):()=>void;
  onDocumentProgress?(listener: (event: z.infer<typeof documentProgressSchema>) => void): () => void;
  getPathForFile?(file: File): string;
  invoke<C extends IpcChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<IpcResponse<C>>;
  onChatEvent(
    requestId: string,
    listener: (event: ChatEnvelope["event"]) => void,
  ): () => void;
}

export const moodleProgressChannel = 'moodle:progress';
export const moodleProgressSchema = z.object({accountId:z.string().uuid(),courseId:z.string().uuid().optional(),panel:moodlePanelSchema.optional(),state:z.enum(['loading','idle','error']),completed:z.number().int().nonnegative(),total:z.number().int().nonnegative()}).strict();
export type MoodleProgress = z.infer<typeof moodleProgressSchema>;
