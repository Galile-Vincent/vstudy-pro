import { z } from "zod";
import {
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
  "documents:import": { request: empty, response: documentSchema.nullable() },
  "documents:importPaths": {
    request: z.object({ paths: z.array(z.string().min(1).max(4096)).min(1).max(100) }).strict(),
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
        models: z.array(z.object({ id: z.string(), name: z.string() })),
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
export const documentProgressSchema = z.object({ documentId: documentIdSchema, message: z.string().min(1).max(200) }).strict();
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
