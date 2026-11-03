import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import {
  conversationSchema,
  messageSchema,
  type ChatRequest,
  type ChatEvent,
  type Conversation,
} from "../../shared/domain";
import { chatEnvelopeSchema, chatEventChannel } from "../../shared/ipc";
import type { Store } from "../db";
import type { ProviderRegistry } from "../providers";
import { ProviderError } from "../providers/api";
import { buildPrompt } from "../prompt";
export interface ChatOwner {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
  once(event: "destroyed", listener: () => void): unknown;
  removeListener(event: "destroyed", listener: () => void): unknown;
}
interface ActiveRequest {
  owner: ChatOwner;
  request: ChatRequest;
  controller: AbortController;
  onDestroyed: () => void;
  text: string;
}
export class ChatService {
  private readonly active = new Map<string, ActiveRequest>();
  constructor(
    private readonly store: Store,
    private readonly providers: ProviderRegistry,
  ) {}
  createConversation(
    input: Pick<Conversation, "documentId" | "providerId" | "modelId">,
  ): Conversation {
    if (!this.store.documents.get(input.documentId))
      throw new Error("Document not found");
    this.providers.get(input.providerId);
    return this.store.conversations.insert(
      conversationSchema.parse({
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    );
  }
  deleteConversation(id: Conversation["id"]): void {
    for (const entry of this.active.values())
      if (entry.request.conversationId === id)
        this.abort(entry.request.requestId, entry.owner);
    this.store.conversations.delete(id);
  }
  start(request: ChatRequest, owner: ChatOwner): void {
    if (owner.isDestroyed()) throw new Error("Chat window unavailable");
    if (this.active.has(request.requestId))
      throw new Error("Request already active");
    if (
      [...this.active.values()].some(
        (entry) => entry.request.conversationId === request.conversationId,
      )
    )
      throw new Error("Conversation already streaming");
    const conversation = this.store.conversations.get(request.conversationId);
    const document = this.store.documents.get(request.documentId);
    if (
      !conversation ||
      conversation.documentId !== request.documentId ||
      conversation.providerId !== request.providerId ||
      conversation.modelId !== request.modelId ||
      (request.selection && request.selection.documentId !== request.documentId)
    )
      throw new Error("Chat context mismatch");
    if (!document || document.status !== "ready")
      throw new Error("Document is not ready");
    const adapter = this.providers.get(request.providerId);
    const messages = this.store.messages.list(request.conversationId);
    const history = messages.filter((message, index) => message.role === "assistant"
      ? message.parts.every(p => !p.status || p.status === "complete")
      : messages[index + 1]?.role === "assistant" && messages[index + 1]!.parts.every(p => !p.status || p.status === "complete"));
    this.persist(request, "user", request.userMessage);
    const entry: ActiveRequest = {
      owner,
      request,
      controller: new AbortController(),
      text: "",
      onDestroyed: () => this.abort(request.requestId, owner),
    };
    this.active.set(request.requestId, entry);
    owner.once("destroyed", entry.onDestroyed);
    // Start after the invoke acknowledgement so subscribers can process acceptance first.
    setImmediate(() => {
      void this.produce(entry, document, history, adapter);
    });
  }
  abort(requestId: string, owner: ChatOwner): void {
    const entry = this.active.get(requestId);
    if (!entry) return;
    if (entry.owner !== owner)
      throw new Error("Request belongs to another window");
    entry.controller.abort();
    this.finish(entry, { type: "done" });
  }
  abortDocument(documentId: ChatRequest["documentId"]): void {
    for (const entry of this.active.values())
      if (entry.request.documentId === documentId) this.abort(entry.request.requestId, entry.owner);
  }
  dispose(): void {
    for (const entry of this.active.values())
      this.abort(entry.request.requestId, entry.owner);
  }
  private persist(
    request: ChatRequest,
    role: "user" | "assistant",
    text: string,
    status: "complete" | "aborted" | "error" = "complete",
  ) {
    const previous = this.store.messages.list(request.conversationId).at(-1);
    const createdAt = new Date(
      Math.max(Date.now(), previous ? Date.parse(previous.createdAt) + 1 : 0),
    ).toISOString();
    this.store.messages.insert(
      messageSchema.parse({
        id: randomUUID(),
        conversationId: request.conversationId,
        role,
        parts: [{ type: "text", text, status, ...(role === "user" && request.selection ? { selection: request.selection } : {}) }],
        createdAt,
      }),
    );
  }
  private send(entry: ActiveRequest, event: ChatEvent) {
    try {
      if (!entry.owner.isDestroyed())
        entry.owner.send(
          chatEventChannel,
          chatEnvelopeSchema.parse({
            requestId: entry.request.requestId,
            event,
          }),
        );
    } catch {
      this.abort(entry.request.requestId, entry.owner);
    }
  }
  private finish(
    entry: ActiveRequest,
    event: Exclude<ChatEvent, { type: "text-delta" }>,
  ) {
    if (this.active.get(entry.request.requestId) !== entry) return;
    this.active.delete(entry.request.requestId);
    entry.owner.removeListener("destroyed", entry.onDestroyed);
    try {
      if (entry.text) this.persist(entry.request, "assistant", entry.text, entry.controller.signal.aborted ? "aborted" : event.type === "error" ? "error" : "complete");
    } catch {
      if (!entry.controller.signal.aborted)
        event = { type: "error", message: "Chat could not be saved" };
    }
    this.send(entry, event);
  }
  private async produce(
    entry: ActiveRequest,
    document: NonNullable<ReturnType<Store["documents"]["get"]>>,
    history: ReturnType<Store["messages"]["list"]>,
    adapter: ReturnType<ProviderRegistry["get"]>,
  ) {
    try {
      entry.controller.signal.throwIfAborted();
      const file = await open(document.markdownPath, "r");
      let markdown: string;
      try {
        const buffer = Buffer.alloc(2_000_000);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        markdown = buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await file.close();
      }
      entry.controller.signal.throwIfAborted();
      const prompt = buildPrompt({
        document: { title: document.title, markdown },
        history,
        userMessage: entry.request.userMessage,
        ...(entry.request.selection
          ? { selection: entry.request.selection }
          : {}),
      });
      for await (const event of adapter.stream(
        { ...entry.request, prompt },
        entry.controller.signal,
      )) {
        if (
          this.active.get(entry.request.requestId) !== entry ||
          entry.controller.signal.aborted
        )
          return;
        if (event.type !== "text-delta") {
          this.finish(
            entry,
            event.type === "error"
              ? { type: "error", message: "Provider request failed" }
              : event,
          );
          return;
        }
        if (entry.text.length + event.text.length > 2_000_000)
          throw new Error("Response too large");
        entry.text += event.text;
        this.send(entry, event);
      }
      this.finish(entry, {
        type: "error",
        message: "Provider stream ended unexpectedly",
      });
    } catch (error) {
      this.finish(
        entry,
        entry.controller.signal.aborted
          ? { type: "done" }
          : {
              type: "error",
              message:
                error instanceof ProviderError ? error.message : "Chat request failed. Check provider configuration and try again.",
            },
      );
    } finally {
      entry.controller.abort();
    }
  }
}
