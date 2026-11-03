import { z } from "zod";

export const documentIdSchema = z.string().uuid().brand<"DocumentId">();
export const conversationIdSchema = z.string().uuid().brand<"ConversationId">();
export const messageIdSchema = z.string().uuid().brand<"MessageId">();
export const requestIdSchema = z.string().uuid().brand<"RequestId">();
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
  ready: [],
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
    page: z.number().int().positive().optional(),
  })
  .strict()
  .refine((s) => s.endOffset >= s.startOffset, "Selection end precedes start");
export type Selection = z.infer<typeof selectionSchema>;
export const conversationSchema = z
  .object({
    id: conversationIdSchema,
    documentId: documentIdSchema,
    providerId: providerIdSchema,
    modelId: z.string().min(1),
    createdAt: timestamp,
  })
  .strict();
export type Conversation = z.infer<typeof conversationSchema>;
export const messagePartSchema = z
  .object({ type: z.literal("text"), text: z.string(), selection: selectionSchema.optional(), status: z.enum(["complete", "aborted", "error"]).optional() })
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
export const chatRequestSchema = z
  .object({
    requestId: requestIdSchema,
    conversationId: conversationIdSchema,
    documentId: documentIdSchema,
    providerId: providerIdSchema,
    modelId: z.string().min(1),
    userMessage: z.string().min(1),
    selection: selectionSchema.optional(),
  })
  .strict()
  .refine(
    (r) => !r.selection || r.selection.documentId === r.documentId,
    "Selection belongs to another document",
  );
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text-delta"), text: z.string(), selection: selectionSchema.optional(), status: z.enum(["complete", "aborted", "error"]).optional() }).strict(),
  z.object({ type: z.literal("done") }).strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export const settingsSchema = z
  .object({
    chatSide: z.enum(["left", "right"]),
    lastProviderId: providerIdSchema.nullable(),
    lastModelId: z.string().nullable(),
    lastDocumentId: documentIdSchema.nullable().default(null),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  chatSide: "left",
  lastProviderId: null,
  lastModelId: null,
  lastDocumentId: null,
};
