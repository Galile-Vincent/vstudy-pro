import { CourseContextCache } from "../planner/context";
import { PlannerRepository } from "../planner/repository";
import { buildMaterialContext } from "../planner/materials";
import { MoodleRepository } from "../moodle/repository";
import { buildCoursePrompt, parseCourseActions } from "../prompt/course";
import type { MoodleAgentAction } from "../../shared/moodle";
import { dirname, join } from "node:path";
import { containedPath } from "./file-paths";
import { ActivityService } from "./activity";
import { validateOptions } from "../providers/models";
import { canonicalModelId, priceUsage } from "../pricing";
import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import {
  conversationSchema,
  messageSchema,
  usageSchema, type Usage,
  type ChatRequest,
  type ChatEvent,
  type Conversation,
} from "../../shared/domain";
import { chatEnvelopeSchema, chatEventChannel } from "../../shared/ipc";
import type { Store } from "../db";
import type { ProviderRegistry } from "../providers";
import { ProviderError } from "../providers/api";
import { buildPrompt } from "../prompt";
import { citationCatalog, citedReferences } from "../prompt/citations";
import { presentationSchema } from "../../shared/presentation";
import { chatEventSchema, type DocumentCitation, type ToolCall } from "../../shared/domain";
export interface ChatOwner {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
  once(event: "destroyed", listener: () => void): unknown;
  removeListener(event: "destroyed", listener: () => void): unknown;
}
interface ActiveRequest {
  owner: ChatOwner;
  userMessageId: string;
  assistantMessageId: string;
  request: ChatRequest;
  controller: AbortController;
  onDestroyed: () => void;
  text: string;
  rawCourseText?: string;
  proposals?: MoodleAgentAction[];
  reasoning?: string;
  citations?: DocumentCitation[];
  citationCatalog?: DocumentCitation[];
  toolCalls?: ToolCall[];
  usage?: Usage;
  usageModels?: { modelId: string; usage: Usage }[];
  usageEmitted?: boolean;
  promptChars?: number;
  restoreOnFailure?: boolean;
  supersedeOnSave?: import("../../shared/domain").Message["id"][];
}
export class ChatService {
  private readonly courseContext: CourseContextCache;
  private stopped = false;
  private readonly producers = new Set<Promise<void>>();
  private readonly deleting = new Set<string>();
  async deleteDocument(id: import("../../shared/domain").Document["id"], remove: () => Promise<void>): Promise<void> {
    if (this.deleting.has(id)) throw new Error("Document is deleting");
    this.deleting.add(id);
    try { this.abortDocument(id); await remove(); } finally { this.deleting.delete(id); }
  }
  private readonly active = new Map<string, ActiveRequest>();
  constructor(
    private readonly store: Store,
    private readonly providers: ProviderRegistry,
  ) { this.courseContext = new CourseContextCache(store.db); }
  createConversation(
    input: import("zod").z.infer<typeof import("../../shared/domain").conversationCreateSchema>,
  ): Conversation {
    if (input.scope === "course") new MoodleRepository(this.store.db).course(input.courseId);
    else {
      if (this.deleting.has(input.documentId)) throw new Error("Document is deleting");
      if (!this.store.documents.get(input.documentId))
        throw new Error("Document not found");
    }
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
  start(request: ChatRequest, owner: ChatOwner): void | Promise<void> {
    if (this.stopped) throw new Error("Chat service is closed");
    if (!Object.keys(request.options ?? {}).length) return this.accept(request, owner);
    const adapter = this.providers.get(request.providerId);
    return adapter.listModels().then(models => {
      validateOptions(models.find(m => m.id === request.modelId || m.resolvedId === request.modelId), request.options);
      this.accept(request, owner);
    });
  }
  private accept(request: ChatRequest, owner: ChatOwner): void {
    if (this.stopped) throw new Error("Chat service is closed");
    if (request.scope !== "course" && this.deleting.has(request.documentId)) throw new Error("Document is deleting");
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
    const document = request.scope === "course" ? null : this.store.documents.get(request.documentId);
    if (
      !conversation ||
      (request.scope === "course" ? conversation.scope !== "course" || conversation.courseId !== request.courseId : conversation.scope === "course" || conversation.documentId !== request.documentId) ||
      conversation.providerId !== request.providerId ||
      conversation.modelId !== request.modelId ||
      (request.scope !== "course" && request.selection && request.selection.documentId !== request.documentId)
    )
      throw new Error("Chat context mismatch");
    if (request.scope !== "course" && (!document || document.status !== "ready"))
      throw new Error("Document is not ready");
    if(request.scope !== "course" && request.selection && (request.selection.version ?? "original")!==document?.activeVersion)throw new Error("Selection version mismatch");
    const adapter = this.providers.get(request.providerId);
    const messages = this.store.messages.list(request.conversationId);
    const replayIndex = request.turnId ? messages.findIndex(m => m.role === 'user' && (m.id === request.turnId || m.parts.some(p => p.turnId === request.turnId))) : -1;
    const replayUser = replayIndex >= 0 ? messages[replayIndex] : undefined;
    const regenerating = replayUser?.parts.map(p => p.text).join('\n') === request.userMessage;
    const userMessageId = regenerating ? replayUser!.id : randomUUID();
    const assistantMessageId = randomUUID();
    const omittedIndex = request.contextTurnIds ? messages.findIndex((m, index) => m.role === 'user' && index !== replayIndex && !request.contextTurnIds!.includes(m.parts[0]?.turnId ?? m.id)) : -1;
    const cutoff = replayIndex >= 0 ? replayIndex : omittedIndex;
    const superseded = cutoff >= 0 ? messages.slice(cutoff + (regenerating ? 1 : 0)).map(m => m.id) : [];
    const beforeReplay = cutoff < 0 ? messages : messages.slice(0, cutoff);
    const contextMessages = request.contextTurnIds ? beforeReplay.filter((m, index) => {
      const turnId = m.parts[0]?.turnId ?? (m.role === 'user' ? m.id : beforeReplay[index - 1]?.id);
      return !!turnId && request.contextTurnIds!.includes(turnId);
    }) : beforeReplay;
    const latestTurns = contextMessages.filter((m, i, all) => {
      const turn = m.parts[0]?.turnId;
      return !turn || !all.slice(i + 1).some(next => next.role === m.role && next.parts[0]?.turnId === turn);
    });
    const history = latestTurns.filter((message, index) => message.role === "assistant"
      ? message.parts.every(p => !p.contextExcluded && (!p.status || p.status === "complete"))
      : latestTurns[index + 1]?.role === "assistant" && latestTurns[index + 1]!.parts.every(p => !p.contextExcluded && (!p.status || p.status === "complete")));
    this.store.db.exec("SAVEPOINT accept_chat");
    try {
      if (!regenerating) {
        this.persist(request, "user", request.userMessage, "complete", undefined, userMessageId);
        this.store.messages.supersede(superseded, userMessageId);
      }
      if (request.scope !== "course") new ActivityService(this.store).record("chat", request.documentId, 0, request.requestId);
      this.store.db.exec("RELEASE accept_chat");
    } catch (error) {
      this.store.db.exec("ROLLBACK TO accept_chat; RELEASE accept_chat");
      throw error;
    }
    const entry: ActiveRequest = {
      owner,
      ...(regenerating ? {supersedeOnSave: superseded} : {}),
      restoreOnFailure: !regenerating && superseded.length > 0,
      userMessageId,
      assistantMessageId,
      request,
      controller: new AbortController(),
      text: "",
      onDestroyed: () => this.abort(request.requestId, owner),
    };
    this.active.set(request.requestId, entry);
    owner.once("destroyed", entry.onDestroyed);
    // Start after the invoke acknowledgement so subscribers can process acceptance first.
    const producer = new Promise<void>(resolve => setImmediate(resolve)).then(() => this.produce(entry, document, history, adapter));
    this.producers.add(producer);
    void producer.finally(() => this.producers.delete(producer));
  }
  abort(requestId: string, owner: ChatOwner): void {
    const entry = this.active.get(requestId);
    if (!entry) return;
    if (entry.owner !== owner)
      throw new Error("Request belongs to another window");
    entry.controller.abort();
    this.finish(entry, { type: "done" });
  }
  abortDocument(documentId: import("../../shared/domain").Document["id"]): void {
    for (const entry of this.active.values())
      if (entry.request.scope !== "course" && entry.request.documentId === documentId) this.abort(entry.request.requestId, entry.owner);
  }
  async waitForIdle(): Promise<void> { await Promise.all(this.producers); }
  async dispose(): Promise<void> {
    this.stopped = true;
    for (const entry of this.active.values())
      this.abort(entry.request.requestId, entry.owner);
    await Promise.all(this.producers);
  }
  private persist(
    request: ChatRequest,
    role: "user" | "assistant",
    text: string,
    status: "complete" | "aborted" | "error" = "complete",
    usage?: Usage,
    id: string = randomUUID(),
    error?: string,
    extras: { proposals?: MoodleAgentAction[]; reasoning?: string; citations?: DocumentCitation[]; toolCalls?: ToolCall[] } = {},
  ) {
    const previous = this.store.messages.list(request.conversationId).at(-1);
    const createdAt = new Date(
      Math.max(Date.now(), previous ? Date.parse(previous.createdAt) + 1 : 0),
    ).toISOString();
    this.store.messages.insert(
      messageSchema.parse({
        id,
        conversationId: request.conversationId,
        role,
        parts: [{ type: "text", text, status, ...extras, modelId: request.modelId, options: request.options, turnId: request.turnId, ...(error ? { error } : {}), ...(usage ? { usage } : {}), ...(role === "user" && request.scope !== "course" && request.selection ? { selection: request.selection } : {}) }],
        createdAt,
      }),
    );
  }
  private send(entry: ActiveRequest, event: ChatEvent) {
    if(event.type === 'error') {
      const category = /auth/i.test(event.message) ? 'auth_failed' : /rate.limit/i.test(event.message) ? 'rate_limited' : /network/i.test(event.message) ? 'network' : /budget|quota/i.test(event.message) ? 'budget' : 'provider_unavailable';
      event = {...event,code:`errors.${category}`,params:{}};
    }
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
    event: Extract<ChatEvent, { type: "done" | "error" }>,
  ) {
    if (this.active.get(entry.request.requestId) !== entry) return;
    this.active.delete(entry.request.requestId);
    entry.owner.removeListener("destroyed", entry.onDestroyed);
    try {
      this.store.db.exec("SAVEPOINT finish_chat");
      const messageId = entry.assistantMessageId;
      const restoreBranch = entry.restoreOnFailure && !entry.text && !entry.reasoning && !entry.toolCalls?.length && (entry.controller.signal.aborted || event.type === 'error');
      if (restoreBranch) {
        this.store.db.prepare('UPDATE messages SET supersededBy=NULL WHERE supersededBy=?').run(entry.userMessageId);
        this.store.db.prepare('DELETE FROM messages WHERE id=?').run(entry.userMessageId);
      }
      const citedIds = new Set([...(entry.citations ?? []), ...citedReferences(entry.text, entry.citationCatalog ?? [])].map(c => c.id));
      const citations = (entry.citationCatalog ?? []).filter(c => citedIds.has(c.id));
      if (citations.length && !entry.controller.signal.aborted) this.send(entry, { type: 'citations', citations });
      const modelId = canonicalModelId(entry.usageModels?.[0]?.modelId ?? entry.request.modelId);
      const reported = entry.usage?.costSource === 'reported' || entry.usageEmitted;
      if (entry.text && !reported) entry.usage = {
        ...entry.usage,
        inputTokens: Math.max(entry.usage?.inputTokens ?? 0, Math.ceil((entry.promptChars ?? 0) / 4)),
        outputTokens: Math.max(entry.usage?.outputTokens ?? 0, Math.ceil(entry.text.length / 4)),
        costUsd: undefined, costSource: 'estimated',
      };
      if (entry.usage && !entry.text && !reported && !entry.usage.inputTokens && !entry.usage.outputTokens && !entry.usage.cacheReadTokens && !entry.usage.cacheWriteTokens && !entry.usage.reasoningTokens) delete entry.usage;
      if (entry.usage) {
        entry.usage = priceUsage(modelId, entry.usage, this.store.settings.get().priceOverrides);
        for (const model of reported && entry.usageModels?.length ? entry.usageModels : [{ modelId, usage: entry.usage }]) this.store.usage.record({ ...priceUsage(model.modelId, model.usage, this.store.settings.get().priceOverrides), aborted: entry.controller.signal.aborted, id: randomUUID(), createdAt: new Date().toISOString(), providerId: entry.request.providerId, modelId: canonicalModelId(model.modelId), kind: 'chat', conversationId: entry.request.conversationId, documentId: entry.request.scope === "course" ? undefined : entry.request.documentId, messageId: messageId as import('../../shared/domain').Message['id'] });
        this.send(entry, { type: 'usage', usage: entry.usage });
      }
      if (!restoreBranch && (entry.text || entry.proposals?.length || entry.reasoning || entry.toolCalls?.length || entry.usage || event.type === "error")) this.persist(entry.request, "assistant", entry.text, entry.controller.signal.aborted ? "aborted" : event.type === "error" ? "error" : "complete", entry.usage, messageId, event.type === "error" ? event.message : undefined, { ...(entry.proposals?.length ? {proposals: entry.proposals} : {}), ...(entry.reasoning ? { reasoning: entry.reasoning } : {}), ...(citations.length ? { citations } : {}), ...(entry.toolCalls?.length ? { toolCalls: entry.toolCalls } : {}) });
      this.store.messages.link(messageId, entry.userMessageId);
      if (entry.supersedeOnSave && entry.text) this.store.messages.supersede(entry.supersedeOnSave, messageId);
      this.store.db.exec("RELEASE finish_chat");
    } catch {
      this.store.db.exec("ROLLBACK TO finish_chat; RELEASE finish_chat");
      if (!entry.controller.signal.aborted)
        event = { type: "error", message: "Chat could not be saved" };
    }
    this.send(entry, event);
  }
  private async produce(
    entry: ActiveRequest,
    document: ReturnType<Store["documents"]["get"]>,
    history: ReturnType<Store["messages"]["list"]>,
    adapter: ReturnType<ProviderRegistry["get"]>,
  ) {
    try {
      entry.controller.signal.throwIfAborted();
      this.store.conversations.setOptions(entry.request.conversationId, entry.request.options);
      entry.controller.signal.throwIfAborted();
      let prompt: string;
      let allowPresentation = false;
      if (entry.request.scope === "course") {
        const { detail, planner, syncedAt } = this.courseContext.get(entry.request.courseId);
        prompt = buildCoursePrompt(detail, history, entry.request.userMessage, this.store.settings.get().replyLanguage,
          id => this.store.documents.get(id as import("../../shared/domain").Document["id"])?.status ?? "not-opened",
          new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone, planner, syncedAt);
        if (entry.request.materials) prompt += "\n\n" + await buildMaterialContext(this.store, entry.request.courseId, entry.request.materials);
        entry.rawCourseText = "";
      } else {
        if (!document) throw new Error("Document unavailable");
        const file = await open(containedPath(dirname(document.sourcePath), document.activeVersion==='ai' ? join(dirname(document.markdownPath),'content.ai.md') : document.markdownPath), "r");
        let markdown: string;
        try {
          const buffer = Buffer.alloc(2_000_000);
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          markdown = buffer.subarray(0, bytesRead).toString("utf8");
        } finally {
          await file.close();
        }
        entry.controller.signal.throwIfAborted();
        entry.citationCatalog = citationCatalog(entry.request.documentId, markdown).map(c=>({...c,version:document.activeVersion}));
        allowPresentation = this.store.settings.get().enableGenerativeUI && ['anthropic-api','openai-api'].includes(entry.request.providerId);
        prompt = buildPrompt({
          replyLanguage: this.store.settings.get().replyLanguage,
          citations: entry.citationCatalog,
          document: { title: document.title, markdown },
          history,
          userMessage: entry.request.userMessage,
          ...(entry.request.selection
            ? { selection: entry.request.selection }
            : {}),
        });
      }
      entry.promptChars = prompt.length;
      for await (const rawEvent of adapter.stream(
        { ...entry.request, prompt, allowPresentation, onUsageSnapshot: (usage, models) => { if (this.active.get(entry.request.requestId) === entry) { entry.usage = usageSchema.parse(usage); if (models) entry.usageModels = models.map(m => ({modelId: m.modelId, usage: usageSchema.parse(m.usage)})); } } },
        entry.controller.signal,
      )) {
        const event = chatEventSchema.parse(rawEvent);
        if (
          this.active.get(entry.request.requestId) !== entry ||
          entry.controller.signal.aborted
        )
          return;
        if (event.type === 'usage') {
          if (entry.usageEmitted) throw new Error('Duplicate usage event');
          entry.usageEmitted = true;
          entry.usage = usageSchema.parse(event.usage);
          continue;
        }
        if (event.type === 'reasoning-delta') {
          if ((entry.reasoning?.length ?? 0) + event.text.length > 2_000_000) throw new Error('Reasoning summary too large');
          entry.reasoning = (entry.reasoning ?? '') + event.text;
          this.send(entry,event);
          continue;
        }
        if (event.type === 'citations') {
          const ids = new Set(event.citations.filter(c => entry.request.scope !== "course" && c.documentId === entry.request.documentId).map(c => c.id));
          entry.citations = (entry.citationCatalog ?? []).filter(c => ids.has(c.id));
          this.send(entry,{type:'citations',citations:entry.citations});
          continue;
        }
        if (event.type === 'tool-call') {
          if (JSON.stringify(event.call).length > 100_000) throw new Error('Tool output too large');
          const presentation = allowPresentation && event.call.toolName === 'present' ? presentationSchema.safeParse(event.call.args) : undefined;
          const call = { ...event.call, result: presentation?.success ? { rendered:true } : { error:'Tool execution is disabled or the presentation is invalid' }, isError: !presentation?.success };
          entry.toolCalls ??= [];
          const index = entry.toolCalls.findIndex(c => c.toolCallId === call.toolCallId);
          if (index >= 0) entry.toolCalls[index] = call;
          else { if (entry.toolCalls.length >= 16) throw new Error('Too many tool calls'); entry.toolCalls.push(call); }
          this.send(entry,{type:'tool-call',call});
          continue;
        }
        if (event.type === "proposals") continue;
        if (event.type !== "text-delta") {
          if (event.type === "done" && entry.request.scope === "course") {
            const planning = new PlannerRepository(this.store.db).context(entry.request.courseId);
            const result = parseCourseActions(entry.rawCourseText ?? "", new MoodleRepository(this.store.db).course(entry.request.courseId), planning.now, planning.snapshot, planning.documentIds);
            entry.text = result.text;
            entry.proposals = result.actions;
            if (result.text) this.send(entry, {type:"text-delta", text:result.text});
            if (result.actions.length) this.send(entry, {type:"proposals", actions:result.actions});
          }
          this.finish(
            entry,
            event.type === "error"
              ? { type: "error", message: new ProviderError(/auth failed/i.test(event.message) ? "auth failed" : /rate limited/i.test(event.message) ? "rate limited" : "provider unavailable").message }
              : event,
          );
          return;
        }
        if (entry.request.scope === "course") {
          if ((entry.rawCourseText?.length ?? 0) + event.text.length > 2_000_000) throw new Error("Response too large");
          entry.rawCourseText = (entry.rawCourseText ?? "") + event.text;
          continue;
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
