import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { openStore } from "../db";
import {
  documentSchema,
  chatRequestSchema,
  type ChatEvent,
} from "../../shared/domain";
import { chatEnvelopeSchema } from "../../shared/ipc";
import { ChatService } from "./chat";
import {
  ProviderRegistry,
  type ProviderAdapter,
  type ProviderRequest,
} from "../providers";
class Owner extends EventEmitter {
  events: ChatEvent[] = [];
  destroyed = false;
  isDestroyed() {
    return this.destroyed;
  }
  send(_channel: string, payload: unknown) {
    this.events.push(chatEnvelopeSchema.parse(payload).event);
    this.emit("sent");
  }
  destroy() {
    this.destroyed = true;
    this.emit("destroyed");
  }
}
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup(adapter: ProviderAdapter) {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-chat-test-"));
  const markdownPath = join(cwd, "content.md");
  await writeFile(markdownPath, "# Study\nExact selected passage");
  const store = openStore(":memory:");
  const registry = new ProviderRegistry();
  registry.register("anthropic-api", adapter);
  const document = store.documents.insert(
    documentSchema.parse({
      id: randomUUID(),
      title: "Study",
      sourceName: "doc.md",
      sourceHash: "a".repeat(64),
      sourcePath: markdownPath,
      markdownPath,
      mime: "text/markdown",
      status: "ready",
      createdAt: new Date().toISOString(),
    }),
  );
  const chat = new ChatService(store, registry);
  const conversation = chat.createConversation({
    documentId: document.id,
    providerId: "anthropic-api",
    modelId: "fake",
  });
  const request = chatRequestSchema.parse({
    requestId: randomUUID(),
    conversationId: conversation.id,
    documentId: document.id,
    providerId: "anthropic-api",
    modelId: "fake",
    userMessage: "Explain this",
    selection: {
      documentId: document.id,
      startOffset: 8,
      endOffset: 30,
      text: "Exact selected passage",
      headingPath: ["Study"],
    },
  });
  cleanups.push(async () => {
    chat.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));
    store.close();
    await rm(cwd, { recursive: true, force: true });
  });
  return { chat, store, request, owner: new Owner() };
}
const available = {
  async detect() {
    return { available: true } as const;
  },
  async listModels() {
    return [];
  },
};
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Timed out waiting for stream");
}
it("persists both messages and streams selection-grounded prompt only to origin", async () => {
  let received: ProviderRequest | undefined;
  const { chat, store, request, owner } = await setup({
    ...available,
    async *stream(req) {
      received = req;
      yield { type: "text-delta", text: "Answer" };
      yield { type: "done" };
      yield { type: "text-delta", text: "late" };
    },
  });
  const other = new Owner();
  chat.start(request, owner);
  await until(() => owner.events.some((e) => e.type === "done"));
  expect(received?.prompt).toContain("Exact selected passage");
  expect(received?.prompt).toContain("Document: Study");
  expect(owner.events).toEqual([
    { type: "text-delta", text: "Answer" },
    { type: "done" },
  ]);
  expect(other.events).toEqual([]);
  expect(
    store.messages
      .list(request.conversationId)
      .map((m) => [m.role, m.parts[0]?.text]),
  ).toEqual([
    ["user", "Explain this"],
    ["assistant", "Answer"],
  ]);
});
it("rejects duplicate ids and foreign aborts; abort emits exactly done despite late adapter output", async () => {
  let release: (() => void) | undefined;
  let aborted = false;
  const { chat, request, owner } = await setup({
    ...available,
    async *stream(_req, signal) {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      yield { type: "text-delta", text: "first" };
      await new Promise<void>((r) => {
        release = r;
      });
      yield { type: "text-delta", text: "late" };
      yield { type: "done" };
    },
  });
  chat.start(request, owner);
  expect(() => chat.start(request, owner)).toThrow("already active");
  expect(() => chat.abort(request.requestId, new Owner())).toThrow(
    "another window",
  );
  await until(() => Boolean(release));
  chat.abort(request.requestId, owner);
  chat.abort(request.requestId, owner);
  release?.();
  await new Promise((r) => setTimeout(r, 15));
  expect(aborted).toBe(true);
  expect(owner.events).toEqual([
    { type: "text-delta", text: "first" },
    { type: "done" },
  ]);
  expect(owner.listenerCount("destroyed")).toBe(0);
});
it("aborts all window-owned requests on destruction and suppresses late deltas", async () => {
  let signal: AbortSignal | undefined;
  const { chat, request, owner } = await setup({
    ...available,
    async *stream(_req, s) {
      signal = s;
      yield { type: "text-delta", text: "first" };
      await new Promise<void>((r) =>
        s.addEventListener("abort", () => r(), { once: true }),
      );
      yield { type: "text-delta", text: "late" };
    },
  });
  chat.start(request, owner);
  await until(() => signal !== undefined);
  owner.destroy();
  await new Promise((r) => setTimeout(r, 10));
  expect(signal?.aborted).toBe(true);
  expect(owner.events).toEqual([{ type: "text-delta", text: "first" }]);
});
it("sanitizes provider exceptions and rejects inconsistent context before persistence", async () => {
  const { chat, store, request, owner } = await setup({
    ...available,
    async *stream() {
      throw new Error("private-key and document content");
      yield { type: "done" };
    },
  });
  expect(() => chat.start({ ...request, modelId: "wrong" }, owner)).toThrow(
    "mismatch",
  );
  expect(store.messages.list(request.conversationId)).toEqual([]);
  chat.start(request, owner);
  await until(() => owner.events.length > 0);
  expect(owner.events).toEqual([
    {
      type: "error",
      message:
        "Chat request failed. Check provider configuration and try again.",
    },
  ]);
});
it("an immediate abort never starts the provider and does not persist an empty assistant", async () => {
  let called = false;
  const { chat, store, request, owner } = await setup({
    ...available,
    async *stream() {
      called = true;
      yield { type: "done" };
    },
  });
  chat.start(request, owner);
  chat.abort(request.requestId, owner);
  await new Promise((r) => setTimeout(r, 10));
  expect(called).toBe(false);
  expect(owner.events).toEqual([{ type: "done" }]);
  expect(store.messages.list(request.conversationId)).toHaveLength(1);
});
it("loads the repository Markdown path and supplies stored history on subsequent turns", async () => {
  const prompts: string[] = [];
  const { chat, request, owner, store } = await setup({
    ...available,
    async *stream(req) {
      prompts.push(req.prompt);
      yield { type: "text-delta", text: "Previous answer" };
      yield { type: "done" };
    },
  });
  const { selection: _selection, ...withoutSelection } = request;
  void _selection;
  chat.start(withoutSelection, owner);
  await until(() => owner.events.some((e) => e.type === "done"));
  chat.start({ ...withoutSelection, requestId: request.requestId }, owner);
  await until(() => owner.events.filter((e) => e.type === "done").length === 2);
  expect(prompts[0]).toContain("Excerpt:\n# Study\nExact selected passage");
  expect(prompts[1]).toContain("assistant: Previous answer");
  expect(
    store.messages.list(request.conversationId).map((m) => m.role),
  ).toEqual(["user", "assistant", "user", "assistant"]);
});
it("releases a request if its window transport fails during a delta", async () => {
  const { chat, request, owner } = await setup({
    ...available,
    async *stream() {
      yield { type: "text-delta", text: "answer" };
      yield { type: "done" };
    },
  });
  const send = owner.send.bind(owner);
  let fail = true;
  owner.send = (channel, payload) => {
    if (fail) {
      fail = false;
      throw new Error("Window transport closed");
    }
    send(channel, payload);
  };
  chat.start(request, owner);
  await until(() => owner.events.some((e) => e.type === "done"));
  expect(owner.events).toEqual([{ type: "done" }]);
  expect(() => chat.start(request, owner)).not.toThrow();
  await until(() => owner.events.filter((e) => e.type === "done").length === 2);
});
it.each(["document", "conversation"])("aborts before deleting %s without late save errors", async kind => {
  let signal: AbortSignal | undefined;
  const { chat, store, request, owner } = await setup({ ...available, async *stream(_req, s) {
    signal = s;
    yield { type: "text-delta", text: "partial" };
    await new Promise<void>(resolve => s.addEventListener("abort", () => resolve(), { once: true }));
    yield { type: "done" };
  } });
  chat.start(request, owner);
  await until(() => owner.events.length === 1);
  if (kind === "document") { chat.abortDocument(request.documentId); store.documents.delete(request.documentId); }
  else chat.deleteConversation(request.conversationId);
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(signal?.aborted).toBe(true);
  expect(owner.events).toEqual([{ type: "text-delta", text: "partial" }, { type: "done" }]);
  expect(store.messages.list(request.conversationId)).toEqual([]);
});
it("persists structured selection and partial status, excludes incomplete turns from prompts", async () => {
  let second = false;
  let prompt = "";
  const { chat, store, request, owner } = await setup({ ...available, async *stream(req) {
    prompt = req.prompt;
    yield { type: "text-delta", text: "partial answer" };
    yield second ? { type: "done" } : { type: "error", message: "failure" };
  } });
  chat.start(request, owner);
  await until(() => owner.events.some(e => e.type === "error"));
  const messages = store.messages.list(request.conversationId);
  expect(messages[0]?.parts[0]?.text).toBe("Explain this");
  expect(messages[0]?.parts[0]?.selection?.text).toBe("Exact selected passage");
  expect(messages[1]?.parts[0]?.status).toBe("error");
  second = true;
  chat.start({ ...request, userMessage: "Next question" }, owner);
  await until(() => owner.events.some(e => e.type === "done"));
  expect(prompt).not.toContain("partial answer");
  expect(prompt).not.toContain("Explain this");
});
