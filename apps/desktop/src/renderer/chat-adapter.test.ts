import { describe, expect, it, vi } from "vitest";
import type { ChatModelRunOptions } from "@assistant-ui/react";
import type { ChatContext } from "./chat-adapter";
import type { DesktopApi, ChatEvent } from "../shared";
import { createChatAdapter } from "./chat-adapter";
const context = {
  conversationId: "c",
  documentId: "d",
  providerId: "openai-api",
  modelId: "m",
} as Extract<ChatContext, {documentId: unknown}>;
function setup(
  start: (listener: (event: ChatEvent) => void) => Promise<unknown>,
) {
  let listener: (event: ChatEvent) => void;
  const unsubscribe = vi.fn(),
    order: string[] = [];
  const invoke = vi.fn(async (channel: string) => {
    order.push(channel);
    if (channel === "chat:start") await start(listener);
    return { ok: true };
  });
  const bridge = {
    invoke,
    onChatEvent: vi.fn((_id: string, callback: typeof listener) => {
      order.push("subscribe");
      listener = callback;
      return unsubscribe;
    }),
  } as unknown as DesktopApi;
  const connection = createChatAdapter(bridge, async () => context);
  const controller = new AbortController();
  const options = {
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    abortSignal: controller.signal,
  } as unknown as ChatModelRunOptions;
  const stream = connection.adapter.run(options) as AsyncGenerator;
  return { connection, controller, stream, unsubscribe, order, invoke };
}
describe("IPC chat adapter", () => {
  it("does not start a request when unmounted while resolving context", async () => {
    let resolveContext: (value: ChatContext) => void = () => {};
    const invoke = vi.fn();
    const connection = createChatAdapter(
      { invoke, onChatEvent: vi.fn() } as unknown as DesktopApi,
      () =>
        new Promise((resolve) => {
          resolveContext = resolve;
        }),
    );
    const stream = connection.adapter.run({
      messages: [],
      abortSignal: new AbortController().signal,
    } as unknown as ChatModelRunOptions) as AsyncGenerator;
    const pending = stream.next();
    connection.dispose();
    resolveContext(context);
    expect((await pending).done).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("subscribes before start and yields cumulative synchronous deltas", async () => {
    const test = setup(async (emit) => {
      emit({ type: "text-delta", text: "A" });
      emit({ type: "text-delta", text: "B" });
      emit({ type: "done" });
    });
    const results = [];
    for await (const item of test.stream) results.push(item);
    expect(results).toEqual([
      { content: [{ type: "text", text: "A" }], metadata: {custom: {modelId:"m",options:undefined,citations:[]}} },
      { content: [{ type: "text", text: "AB" }], metadata: {custom: {modelId:"m",options:undefined,citations:[]}} },
    ]);
    expect(test.order).toEqual(["subscribe", "chat:start"]);
    expect(test.unsubscribe).toHaveBeenCalled();
  });
  it("unsubscribes on start rejection", async () => {
    const test = setup(async () => {
      throw new Error("start failed");
    });
    expect((await test.stream.next()).value).toEqual({content:[{type:'text',text:''}],metadata:{custom:{modelId:'m',options:undefined,citations:[]}},status:{type:'incomplete',reason:'error',error:'Something went wrong. Please try again.'}});
    expect(test.unsubscribe).toHaveBeenCalled();
  });
  it("aborts and releases a pending stream on unmount", async () => {
    const test = setup(async () => {});
    const pending = test.stream.next();
    await vi.waitFor(() => expect(test.invoke).toHaveBeenCalled());
    test.connection.dispose();
    expect((await pending).done).toBe(true);
    expect(test.invoke).toHaveBeenCalledWith("chat:abort", expect.anything());
    expect(test.unsubscribe).toHaveBeenCalled();
  });
  it("forwards AbortSignal and surfaces terminal errors", async () => {
    const aborted = setup(async () => {});
    const pending = aborted.stream.next();
    await vi.waitFor(() => expect(aborted.invoke).toHaveBeenCalled());
    aborted.controller.abort();
    expect((await pending).done).toBe(true);
    const failed = setup(async (emit) =>
      emit({ type: "error", message: "provider failed" }),
    );
    expect((await failed.stream.next()).value).toEqual({content:[{type:'text',text:''}],metadata:{custom:{modelId:'m',options:undefined,citations:[]}},status:{type:'incomplete',reason:'error',error:'Something went wrong. Please try again.'}});
    expect(failed.unsubscribe).toHaveBeenCalled();
  });
});
it("drops queued deltas even if done was already queued when aborted", async () => {
  const test = setup(async emit => {
    emit({ type: "text-delta", text: "first" });
    emit({ type: "text-delta", text: "queued" });
    emit({ type: "done" });
  });
  expect((await test.stream.next()).value).toEqual({ content: [{ type: "text", text: "first" }], metadata: {custom: {modelId:"m",options:undefined,citations:[]}} });
  test.controller.abort();
  expect(await test.stream.next()).toEqual({ value: undefined, done: true });
});
it('retry and regenerate reuse the original selection and options with a fresh request ID', async () => {
  const original = { ...context, options: { reasoningEffort:'ultra' }, selection: { documentId:context.documentId, startOffset:0, endOffset:4, text:'text', headingPath:[] } } as Extract<ChatContext, {documentId: unknown}>;
  let current = original;
  let listener: (event: ChatEvent) => void = () => {};
  const invoke = vi.fn(async () => { listener({type:'done'}); return {ok:true}; });
  const connection = createChatAdapter({ invoke, onChatEvent: (_id: string, cb: typeof listener) => { listener=cb; return () => {}; } } as unknown as DesktopApi, async () => current);
  const options = { messages:[{id:'turn',role:'user',content:[{type:'text',text:'Explain'}]}],abortSignal:new AbortController().signal } as unknown as ChatModelRunOptions;
  for await (const _value of connection.adapter.run(options) as AsyncGenerator) { void _value; }
  current = { ...context, options:{reasoningEffort:'low'} };
  for await (const _value of connection.adapter.run(options) as AsyncGenerator) { void _value; }
  const first = invoke.mock.calls[0] as unknown as [string,Record<string,unknown>];
  const second = invoke.mock.calls[1] as unknown as [string,Record<string,unknown>];
  expect(first).toEqual(['chat:start',{...original,userMessage:'Explain',turnId:'turn',contextTurnIds:[],requestId:expect.any(String)}]);
  expect(second).toEqual(['chat:start',{...original,userMessage:'Explain',turnId:'turn',contextTurnIds:[],requestId:expect.any(String)}]);
  expect(first[1].requestId).not.toBe(second[1].requestId);
});
