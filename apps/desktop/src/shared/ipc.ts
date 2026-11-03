import { statusSchema } from "./status";
import { folderIdSchema, libraryContract } from "./library";
import { z } from "zod";
import {
  modelSchema, modelOptionsSchema,
  chatEventSchema,
  chatRequestSchema,
  conversationIdSchema,
  conversationSchema,
  documentIdSchema,
  documentSchema,
  messageSchema,
  providerConfigSchema,
  providerIdSchema,
  requestIdSchema,
  settingsSchema, usageDashboardSchema, usagePeriodSchema, usageSchema, usageSummarySchema, usageRecordSchema, rateLimitSchema,
} from "./domain";

const empty = z.object({}).strict();
const ack = z.object({ ok: z.literal(true) }).strict();
export const externalUrlSchema = z.string().max(8192).url().refine((value) => {
  if ([...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || value.includes("\\")) return false;
  try { return ["http:", "https:", "mailto:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Only http, https and mailto URLs are allowed");
export const ipcContract = {
  "settings:appearance": { request: empty, response: z.object({ reducedTransparency:z.boolean() }).strict() },
  "settings:systemLocale": { request: empty, response: z.string().max(100) },
  ...libraryContract,
  "usage:dashboard": { request: z.object({ period: usagePeriodSchema }).strict(), response: usageDashboardSchema },
  "usage:estimate": { request: z.object({ conversationId: conversationIdSchema, userMessage: z.string().max(2_000_000) }).strict(), response: usageSchema },
  "usage:summary": { request: z.object({ period: z.enum(['day', 'month', 'last30days']) }).strict(), response: usageSummarySchema },
  "usage:forConversation": { request: z.object({ conversationId: conversationIdSchema }).strict(), response: z.array(usageRecordSchema) },
  "usage:forDocument": { request: z.object({ documentId: documentIdSchema }).strict(), response: z.array(usageRecordSchema) },
  "usage:rateLimits": { request: empty, response: z.array(z.object({ providerId: providerIdSchema, createdAt: z.string().datetime(), rateLimit: rateLimitSchema })) },
  "usage:export": { request: empty, response: z.object({ saved: z.boolean() }).strict() },
  "shell:openExternal": {
    request: z.object({ url: externalUrlSchema }).strict(),
    response: ack,
  },
  "documents:importSample": { request: z.object({ language: z.enum(["en", "zh-Hant", "ja"]) }).strict(), response: documentSchema },
  "documents:import": { request: z.object({ folderId: folderIdSchema.nullable().optional() }).strict(), response: documentSchema.nullable() },
  "documents:importPaths": {
    request: z.object({ paths: z.array(z.string().min(1).max(4096)).min(1).max(100), folderId: folderIdSchema.nullable().optional() }).strict(),
    response: z.array(z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), document: documentSchema }), z.object({ ok: z.literal(false), path: z.string(), error: z.string() })])),
  },
  "documents:list": { request: empty, response: z.array(documentSchema) },
  "documents:get": {
    request: z.object({ documentId: documentIdSchema }).strict(),
    response: documentSchema.nullable(),
  },
  "documents:read": {
    request: z.object({ documentId: documentIdSchema }).strict(),
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
    request: conversationSchema.omit({ id: true, createdAt: true }),
    response: conversationSchema,
  },
  "conversations:model": { request: z.object({ conversationId: conversationIdSchema, providerId: providerIdSchema, modelId: z.string().min(1) }).strict(), response: conversationSchema },
  "conversations:options": { request: z.object({ conversationId: conversationIdSchema, options: modelOptionsSchema }).strict(), response: ack },
  "conversations:list": {
    request: z.object({ documentId: documentIdSchema }).strict(),
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
  "settings:set": { request: settingsSchema, response: settingsSchema },
  "providers:list": {
    request: empty,
    response: z.array(
      z.object({
        config: providerConfigSchema,
        availability: z.discriminatedUnion("available", [
          z.object({ available: z.literal(true) }),
          z.object({ available: z.literal(false), reason: z.string() }),
        ]),
        modelsLoading: z.boolean().optional(),
        models: z.array(modelSchema),
      }),
    ),
  },
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
export const documentProgressSchema = z.object({ documentId: documentIdSchema, code:statusSchema.shape.code.optional(), params:statusSchema.shape.params.optional(), message: z.string().min(1).max(200) }).strict();
export const chatEventChannel = "chat:events";
export const chatEnvelopeSchema = z
  .object({ requestId: requestIdSchema, event: chatEventSchema })
  .strict();
export type ChatEnvelope = z.infer<typeof chatEnvelopeSchema>;
export interface DesktopApi {
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
