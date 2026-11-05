import { z } from "zod";
import { themePreferencesSchema } from './themes';
import { moodleAgentActionSchema } from "./moodle";

export const documentIdSchema = z.string().uuid().brand<"DocumentId">();
export const conversationIdSchema = z.string().uuid().brand<"ConversationId">();
export const messageIdSchema = z.string().uuid().brand<"MessageId">();
export const requestIdSchema = z.string().uuid().brand<"RequestId">();

export const conversationScopeSchema = z.discriminatedUnion("scope", [
 z.object({ scope: z.literal("document").optional(), documentId: documentIdSchema }).strict(),
 z.object({ scope: z.literal("course"), courseId: z.string().uuid() }).strict(),
]);
export type ConversationScope = z.infer<typeof conversationScopeSchema>;

export const providerIdSchema = z.enum([
  "anthropic-api",
  "openai-api",
  "openai-compatible",
  "claude-cli",
  "codex-cli",
  "agy-cli",
]);
const timestamp = z.string().datetime();
const documentFields = {
  id: documentIdSchema,
  title: z.string().min(1),
  sourceName: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePath: z.string().min(1),
  mime: z.string().min(1),
  converter: z.enum(["pdf_md", "markitdown"]).default("markitdown"),
  activeVersion:z.enum(["original","ai"]).default("original"),
  markdownPath: z.string().min(1),
  createdAt: timestamp,
};
export const documentSchema = z.discriminatedUnion("status", [
  z.object({ ...documentFields, status: z.literal("converting") }).strict(),
  z.object({ ...documentFields, status: z.literal("ready") }).strict(),
  z
    .object({
      ...documentFields,
      status: z.literal("failed"),
      error: z.string().min(1),
    })
    .strict(),
]);
export type Document = z.infer<typeof documentSchema>;
export const documentTransitions: Record<
  Document["status"],
  readonly Document["status"][]
> = {
  converting: ["ready", "failed"],
  ready: ["converting"],
  failed: ["converting"],
};
export type DocumentTransition =
  | { status: "ready"; converter?: "pdf_md" | "markitdown" }
  | { status: "failed"; error: string }
  | { status: "converting" };
export function transitionDocument(
  document: Document,
  next: DocumentTransition,
): Document {
  if (!documentTransitions[document.status].includes(next.status))
    throw new Error(
      `Invalid document transition: ${document.status} -> ${next.status}`,
    );
  const fields = z.object(documentFields).parse(document);
  return documentSchema.parse({ ...fields, ...next });
}
export const selectionSchema = z
  .object({
    documentId: documentIdSchema,
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    text: z.string(),
    headingPath: z.array(z.string()),
    version:z.enum(["original","ai"]).optional(),
    page: z.number().int().positive().optional(),
  })
  .strict()
  .refine((s) => s.endOffset >= s.startOffset, "Selection end precedes start");
export type Selection = z.infer<typeof selectionSchema>;
export const modelOptionsSchema = z.record(z.string().min(1), z.union([z.string(), z.boolean()]));
export const modelSchema = z.object({
  supportsImages:z.boolean().optional(), imageUnsupportedReason:z.string().optional(),
  id: z.string(), name: z.string(), resolvedId: z.string().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), values: z.array(z.object({ id: z.string(), label: z.string() })), default: z.string() })).optional(),
});
export type Model = z.infer<typeof modelSchema>;
const conversationFields = {
    id: conversationIdSchema,
    providerId: providerIdSchema,
    modelId: z.string().min(1).max(300),
    options: modelOptionsSchema.optional(),
    createdAt: timestamp,
};
export const conversationCreateSchema = z.discriminatedUnion("scope", [
 conversationScopeSchema.options[0].extend({providerId: providerIdSchema, modelId: conversationFields.modelId, options: modelOptionsSchema.optional()}),
 conversationScopeSchema.options[1].extend({providerId: providerIdSchema, modelId: conversationFields.modelId, options: modelOptionsSchema.optional()}),
]);
export const conversationSchema = z.discriminatedUnion("scope", [
 conversationScopeSchema.options[0].extend(conversationFields),
 conversationScopeSchema.options[1].extend(conversationFields),
]);
export type Conversation = z.infer<typeof conversationSchema>;
export const rateLimitSchema = z.object({
  label: z.string().min(1), usedPercent: z.number().min(0).max(100).optional(),
  remainingTokens: z.number().nonnegative().optional(), remainingRequests: z.number().nonnegative().optional(),
  resetsAt: z.string().datetime().optional(),
}).strict();
export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(), cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(), costUsd: z.number().finite().nonnegative().optional(),
  costSource: z.enum(['reported', 'estimated', 'unknown']), rateLimit: rateLimitSchema.optional(),
}).strict();
export type Usage = z.infer<typeof usageSchema>;
export const priceSchema = z.object({ input: z.number().finite().nonnegative(), output: z.number().finite().nonnegative(), cacheRead: z.number().finite().nonnegative(), cacheWrite: z.number().finite().nonnegative() }).strict();
export type Price = z.infer<typeof priceSchema>;
export const usageRecordSchema = usageSchema.extend({
  aborted: z.boolean().optional(),
  id: z.string().uuid(), createdAt: timestamp, providerId: providerIdSchema, modelId: z.string().min(1).max(300),
  kind: z.enum(['chat', 'parse']), conversationId: conversationIdSchema.optional(), documentId: documentIdSchema.optional(), messageId: messageIdSchema.optional(),
});
export type UsageRecord = z.infer<typeof usageRecordSchema>;
export const usageSummarySchema = z.object({
  inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number().optional(), unknownPrices: z.number(), calls: z.number(),
  groups: z.array(z.object({ providerId: providerIdSchema, modelId: z.string(), documentId: documentIdSchema.optional(), inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number().optional(), unknownPrices: z.number(), calls: z.number() })),
});
export const usagePeriodSchema = z.enum(['day', 'month', 'last30days', 'all']);
export type UsagePeriod = z.infer<typeof usagePeriodSchema>;
export const usageDashboardSchema = z.object({
  parseTotals:z.object({calls:z.number(),inputTokens:z.number(),outputTokens:z.number(),costUsd:z.number().nullable()}).optional(),
  summary: usageSummarySchema,
  cacheReadTokens: z.number().nonnegative(), cacheWriteTokens: z.number().nonnegative(), reasoningTokens: z.number().nonnegative(),
  days: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() })),
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export const documentCitationSchema = z.object({
  version:z.enum(['original','ai']).optional(),
  id: z.string().regex(/^s\d+$/), documentId: documentIdSchema,
  title: z.string().max(300), offset: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(), quote: z.string().max(300),
}).strict();
export type DocumentCitation = z.infer<typeof documentCitationSchema>;
export const toolCallSchema = z.object({
  toolCallId: z.string().min(1).max(200), toolName: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  args: z.record(z.unknown()), result: z.unknown().optional(), isError: z.boolean().optional(),
}).strict();
export type ToolCall = z.infer<typeof toolCallSchema>;
export const messagePartSchema = z
  .object({ type: z.literal("text"), text: z.string(), proposals: z.array(moodleAgentActionSchema).max(5).optional(), reasoning: z.string().max(2_000_000).optional(), citations: z.array(documentCitationSchema).max(128).optional(), toolCalls: z.array(toolCallSchema).max(16).optional(), usage: usageSchema.optional(), modelId: z.string().optional(), options: modelOptionsSchema.optional(), turnId: z.string().optional(), error: z.string().optional(), selection: selectionSchema.optional(), status: z.enum(["complete", "aborted", "error"]).optional() })
  .extend({ contextExcluded: z.boolean().optional() })
  .strict();
export const messageSchema = z
  .object({
    id: messageIdSchema,
    conversationId: conversationIdSchema,
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(messagePartSchema),
    createdAt: timestamp,
  })
  .strict();
export type Message = z.infer<typeof messageSchema>;
export const providerConfigSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("api"),
      id: z.enum(["anthropic-api", "openai-api"]),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("compatible"),
      id: z.literal("openai-compatible"),
      imageModelIds:z.array(z.string().min(1).max(300)).max(500).optional(),
      baseUrl: z
        .string()
        .url()
        .refine((url) => ["http:", "https:"].includes(new URL(url).protocol)),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cli"),
      id: z.enum(["claude-cli", "codex-cli", "agy-cli"]),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
const chatFields = {
    requestId: requestIdSchema,
    conversationId: conversationIdSchema,
    providerId: providerIdSchema,
    modelId: z.string().min(1).max(300),
    userMessage: z.string().min(1),
    options: modelOptionsSchema.optional(),
    turnId: z.string().max(200).optional(),
    contextTurnIds: z.array(z.string().max(200)).max(10000).optional(),
};
export const chatRequestSchema = z.discriminatedUnion("scope", [
 conversationScopeSchema.options[0].extend({...chatFields, selection: selectionSchema.optional()}),
 conversationScopeSchema.options[1].extend(chatFields),
]).refine(r => r.scope === "course" || !r.selection || r.selection.documentId === r.documentId, "Selection belongs to another document");
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const chatEventSchema = z.discriminatedUnion("type", [
 z.object({type: z.literal("proposals"), actions: z.array(moodleAgentActionSchema).max(5)}).strict(),
  z.object({ type: z.literal("reasoning-delta"), text: z.string().max(2_000_000) }).strict(),
  z.object({ type: z.literal("citations"), citations: z.array(documentCitationSchema).max(128) }).strict(),
  z.object({ type: z.literal("tool-call"), call: toolCallSchema }).strict(),
  z.object({ type: z.literal("usage"), usage: usageSchema }).strict(),
  z.object({ type: z.literal("text-delta"), text: z.string(), selection: selectionSchema.optional(), status: z.enum(["complete", "aborted", "error"]).optional() }).strict(),
  z.object({ type: z.literal("done") }).strict(),
  z.object({ type: z.literal("error"), message: z.string(), code:z.string().max(100).optional(), params:z.record(z.union([z.string(),z.number()])).optional() }).strict(),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export const settingsSchema = z
  .object({
    ...themePreferencesSchema.shape,
    uiScale: z.union([z.literal(100),z.literal(125),z.literal(150),z.literal(200)]).default(100),
    density: z.enum(['comfortable','compact']).default('comfortable'),
    accent: z.enum(['neutral','blue','green','violet','amber']).default('neutral'),
    readerFont: z.enum(['system','serif','mono']).default('system'),
    readerSize: z.enum(['s','m','l','xl']).default('m'),
    material: z.enum(['glass','solid']).default('glass'),
    onboardingCompleted: z.boolean().optional(),
    welcomeSeen: z.boolean().default(false),
    displayName: z.string().trim().max(100).optional(),
    language: z.enum(["auto", "en", "zh-Hant", "ja"]).default("auto"),
    replyLanguage: z.enum(["auto", "en", "zh-Hant", "ja"]).default("auto"),
    chatSide: z.enum(["left", "right"]),
    converterIdleMinutes: z.number().int().min(1).max(60).default(5),
    converterOffline: z.boolean().default(false),
    enableGenerativeUI: z.boolean().default(false),
    monthlyBudgetUsd: z.number().finite().positive().optional(),
    monthlyTokenBudget: z.number().int().positive().optional(),
    warnAtPercent: z.number().min(1).max(100).default(80),
    priceOverrides: z.record(z.string().min(1), priceSchema).default({}),
    lastProviderId: providerIdSchema.nullable(),
    lastModelId: z.string().nullable(),
    favoriteModels: z.array(z.string()).optional(),
    recentModels: z.array(z.string()).optional(),
    modelDisplayNames: z.record(z.string()).default({}),
    lastDocumentId: documentIdSchema.nullable().default(null),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  ...themePreferencesSchema.parse({}),
  uiScale:100, density:"comfortable", accent:"neutral", readerFont:"system", readerSize:"m", material:"glass",
  language: "auto", replyLanguage: "auto", welcomeSeen: false,
  chatSide: "left",
  converterIdleMinutes: 5, converterOffline: false, enableGenerativeUI: false, modelDisplayNames: {},
  warnAtPercent: 80, priceOverrides: {},
  lastProviderId: null,
  lastModelId: null,
  lastDocumentId: null,
};
