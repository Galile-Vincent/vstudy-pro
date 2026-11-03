import type { ChatModelAdapter } from "@assistant-ui/react";
import type { ChatRequest, ChatEvent, DesktopApi } from "../shared";
export type ChatContext = Omit<ChatRequest, "requestId" | "userMessage">;
export function createChatAdapter(
  bridge: DesktopApi,
  context: () => Promise<ChatContext>,
  started: (messageId: string) => void = () => {},
) {
  const active = new Set<() => void>();
  let generation = 0;
  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }) {
      const runGeneration = generation;
      const details = await context();
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
        if (terminal) return;
        queue.push(event);
        if (event.type !== "text-delta") {
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
        void bridge.invoke("chat:abort", { requestId }).catch(() => {});
      };
      unsubscribe = bridge.onChatEvent(requestId, push);
      active.add(cancel);
      abortSignal.addEventListener("abort", cancel, { once: true });
      try {
        if (abortSignal.aborted) {
          cancel();
          return;
        }
        // Main may emit the entire response before its start acknowledgement resolves.
        void bridge
          .invoke("chat:start", { ...details, requestId, userMessage })
          .catch((error) =>
            push({
              type: "error",
              message:
                error instanceof Error ? error.message : "Could not start chat",
            }),
          );
        started(messages.filter(m => m.role === "user").at(-1)?.id ?? "");
        let text = "";
        while (true) {
          if (!queue.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          if (abortSignal.aborted || runGeneration !== generation) return;
          const event = queue.shift();
          if (!event) continue;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") return;
          text += event.text;
          yield { content: [{ type: "text", text }] };
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
