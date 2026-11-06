import { materialRequestSchema } from "../shared/planner";
import { statusText, errorText } from "./status";
import type { ChatModelAdapter } from "@assistant-ui/react";
import { modelOptionsSchema, selectionSchema } from "../shared";
import { assistantContent } from './chat-content';
import type { DocumentCitation, ToolCall, Usage, ChatRequest, ChatEvent, DesktopApi } from "../shared";
type Context<T> = T extends ChatRequest ? Omit<T, "requestId" | "userMessage"> : never;
export type ChatContext = Context<ChatRequest>;
export function createChatAdapter(
  bridge: DesktopApi,
  context: () => Promise<ChatContext>,
  started: (messageId: string) => void = () => {},
  proposed: (actions: import("../shared/moodle").MoodleAgentAction[]) => void = () => {},
  partialHistory: () => boolean = () => false,
) {
  const contexts = new Map<string, ChatContext>();
  const active = new Set<() => void>();
  let generation = 0;
  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }) {
      const runGeneration = generation;
      const user = messages.filter(m => m.role === 'user').at(-1);
      const turnId = String(user?.metadata?.custom?.turnId ?? user?.id ?? crypto.randomUUID());
      const details = contexts.get(turnId) ?? await context();
      const saved = user?.metadata?.custom;
      const materials = materialRequestSchema.safeParse(saved?.materials);
      if (details.scope === "course" && materials.success) details.materials = materials.data;
      if (saved?.turnId) {
        const selection = selectionSchema.safeParse(saved.selection);
        const options = modelOptionsSchema.safeParse(saved.options);
        if (selection.success && details.scope !== "course" && details.scope !== "general") details.selection = selection.data;
        if (options.success) details.options = options.data;
      }
      contexts.set(turnId, details);
      if (abortSignal.aborted || runGeneration !== generation) return;
      const requestId = crypto.randomUUID() as ChatRequest["requestId"];
      const userMessage =
        messages
          .filter((m) => m.role === "user")
          .at(-1)
          ?.content.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n") ?? "";
      const queue: ChatEvent[] = [];
      let wake: (() => void) | undefined;
      let terminal = false;
      let unsubscribe = () => {};
      const push = (event: ChatEvent) => {
        if (terminal || abortSignal.aborted || runGeneration !== generation) return;
        queue.push(event);
        if (event.type === "done" || event.type === "error") {
          terminal = true;
          unsubscribe();
        }
        wake?.();
      };
      const cancel = () => {
        queue.length = 0;
        terminal = true;
        unsubscribe();
        queue.push({ type: "done" });
        wake?.();
        void bridge.invoke("chat:abort", { requestId }).then(() => window.dispatchEvent(new Event("usage-updated"))).catch(() => {});
      };
      unsubscribe = bridge.onChatEvent(requestId, push);
      active.add(cancel);
      abortSignal.addEventListener("abort", cancel, { once: true });
      try {
        if (abortSignal.aborted) {
          cancel();
          return;
        }
        // An unloaded prefix is not a deleted branch; let main retain its full context.
        // Main may emit the entire response before its start acknowledgement resolves.
        void bridge
          .invoke("chat:start", { ...details, requestId, userMessage, turnId, ...(!partialHistory() ? {contextTurnIds: messages.filter(m => m.role === "user").slice(0, -1).map(m => String(m.metadata?.custom?.turnId ?? m.id))} : {}) })
          .catch((error) =>
            push({
              type: "error",
              message:
                errorText(error),
            }),
          );
        started(messages.filter(m => m.role === "user").at(-1)?.id ?? "");
        let text = "";
        let usage: Usage | undefined;
        let reasoning = '';
        let citations: DocumentCitation[] = [];
        const toolCalls: ToolCall[] = [];
        const snapshot = () => ({content:assistantContent(text,reasoning,citations,toolCalls),metadata:{custom:{...(usage ? {usage} : {}),modelId:details.modelId,options:details.options,citations}}});
        while (true) {
          if (!queue.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          if (abortSignal.aborted || runGeneration !== generation) return;
          const event = queue.shift();
          if (!event) continue;
          if (event.type === "error") { yield {...snapshot(),status:{type:'incomplete',reason:'error',error:event.code ? statusText({code:event.code,params:event.params ?? {}}) : event.message}}; return; }
          if (event.type === "done") return;
          if (event.type === "proposals") { proposed(event.actions); continue; }
          if (event.type === "usage") { usage = event.usage; window.dispatchEvent(new Event("usage-updated")); }
          else if (event.type === 'text-delta') text += event.text;
          else if (event.type === 'reasoning-delta') reasoning += event.text;
          else if (event.type === 'citations') citations = event.citations;
          else if (event.type === 'tool-call') { const index = toolCalls.findIndex(c => c.toolCallId === event.call.toolCallId); if (index >= 0) toolCalls[index] = event.call; else toolCalls.push(event.call); }
          yield snapshot();
        }
      } finally {
        unsubscribe();
        abortSignal.removeEventListener("abort", cancel);
        active.delete(cancel);
        if (!terminal) cancel();
      }
    },
  };
  return {
    adapter,
    dispose: () => {
      generation++;
      for (const cancel of active) cancel();
      active.clear();
    },
  };
}
