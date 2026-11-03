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
  return { chat, store, request, cwd, owner: new Owner() };
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([{ type: "text-delta", text: "first" }]);
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([
    {
      type: "error",
      code:"errors.provider_unavailable",params:{},
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([{ type: "done" }]);
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([{ type: "done" }]);
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
  expect(owner.events.filter(e => e.type !== "usage")).toEqual([{ type: "text-delta", text: "partial" }, { type: "done" }]);
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
it("rejects new streams and conversations throughout document deletion", async () => {
  const { chat, request, owner } = await setup({ ...available, async *stream() { yield { type: "done" }; } });
  let release!: () => void;
  const deletion = chat.deleteDocument(request.documentId, () => new Promise<void>(resolve => { release = resolve; }));
  expect(() => chat.start(request, owner)).toThrow("Document is deleting");
  expect(() => chat.createConversation(request)).toThrow("Document is deleting");
  release(); await deletion;
  expect(() => chat.start(request, owner)).not.toThrow();
});
it('persists usage exactly once before error and attaches it to the saved assistant', async () => {
  const {chat,store,request,owner} = await setup({...available,async *stream() {
    yield {type:'text-delta',text:'Partial'};
    yield {type:'usage',usage:{inputTokens:1200,outputTokens:340,costUsd:.012,costSource:'reported'}};
    yield {type:'error',message:'private'};
  }});
  chat.start(request,owner);
  await until(()=>owner.events.at(-1)?.type==='error');
  expect(owner.events.map(e=>e.type)).toEqual(['text-delta','usage','error']);
  expect(store.usage.forConversation(request.conversationId)).toMatchObject([{inputTokens:1200,outputTokens:340,costUsd:.012}]);
  expect(store.messages.list(request.conversationId).at(-1)?.parts[0]).toMatchObject({status:'error',usage:{inputTokens:1200,costSource:'reported'}});
});
it('records the latest reported partial snapshot on abort without post-terminal events', async () => {
  const {chat,store,request,owner} = await setup({...available,async *stream(req,signal) {
    req.onUsageSnapshot?.({inputTokens:240,outputTokens:3,costSource:'unknown'});
    yield {type:'text-delta',text:'Partial'};
    await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
    yield {type:'done'};
  }});
  chat.start(request,owner);await until(()=>owner.events.length>0);chat.abort(request.requestId,owner);
  expect(owner.events.map(e=>e.type)).toEqual(['text-delta','usage','done']);
  expect(store.usage.forConversation(request.conversationId)).toMatchObject([{inputTokens:240,outputTokens:3,costSource:'estimated',aborted:true}]);
  await new Promise(resolve=>setTimeout(resolve,10));expect(owner.events).toHaveLength(3);
});
it('records CLI auxiliary model usage separately while displaying aggregate message usage',async()=>{
  const {chat,store,request,owner}=await setup({...available,async *stream(req){
    req.onUsageSnapshot?.({inputTokens:3230,outputTokens:21,costUsd:.0058314,costSource:'reported'},[
      {modelId:'claude-haiku-5-5',usage:{inputTokens:1180,outputTokens:17,costUsd:.0001265,costSource:'reported'}},
      {modelId:'claude-sonnet-5-5',usage:{inputTokens:2050,outputTokens:4,costUsd:.0057049,costSource:'reported'}},
    ]);
    yield {type:'text-delta',text:'OK'};yield {type:'done'};
  }});
  chat.start(request,owner);await until(()=>owner.events.at(-1)?.type==='done');
  expect(store.usage.forConversation(request.conversationId).map(r=>[r.modelId,r.inputTokens,r.outputTokens]).sort()).toEqual([['claude-haiku-5-5',1180,17],['claude-sonnet-5-5',2050,4]]);
  expect(owner.events.filter(e=>e.type==='usage')).toHaveLength(1);
});
it('does not record a failed attempt before any output or reported usage',async()=>{
  const {chat,store,request,owner}=await setup({...available,async *stream(){throw new Error('No usage');yield {type:'done'};}});
  chat.start(request,owner);await until(()=>owner.events.at(-1)?.type==='error');
  expect(store.usage.forConversation(request.conversationId)).toEqual([]);
  expect(owner.events.map(e=>e.type)).toEqual(['error']);
});

it('estimates 1300 streamed characters on Stop, resolves the init model, and prices the aborted row',async()=>{
  const {chat,store,request,owner}=await setup({...available,async *stream(req,signal){
    req.onUsageSnapshot?.({inputTokens:10,outputTokens:4,costSource:'unknown'},[{modelId:'claude-haiku-5-5',usage:{inputTokens:10,outputTokens:4,costSource:'unknown'}}]);
    yield {type:'text-delta',text:'a'.repeat(1300)};
    await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
  }});
  chat.start(request,owner);await until(()=>owner.events.length>0);chat.abort(request.requestId,owner);
  const row=store.usage.forConversation(request.conversationId)[0]!;
  expect(row).toMatchObject({modelId:'claude-haiku-5-5',outputTokens:325,costSource:'estimated',aborted:true});
  expect(row.inputTokens).toBeGreaterThan(10);
  expect(row.costUsd).toBe((row.inputTokens*.1+162.5)/1000000);
});
it('retains explicitly reported zero usage on a completed call',async()=>{
  const {chat,store,request,owner}=await setup({...available,async *stream(){yield {type:'usage',usage:{inputTokens:0,outputTokens:0,costSource:'reported',costUsd:0}};yield {type:'done'};}});
  chat.start(request,owner);await until(()=>owner.events.at(-1)?.type==='done');
  expect(store.usage.forConversation(request.conversationId)).toMatchObject([{inputTokens:0,outputTokens:0,costUsd:0,costSource:'reported',aborted:false}]);
});
it('persists and forwards reasoning, validated citations and a bounded API presentation before one terminal event', async () => {
  const fixture = await setup({...available,async *stream(req) {
    expect(req.allowPresentation).toBe(true);
    yield {type:'reasoning-delta',text:'Reported summary'};
    yield {type:'citations',citations:[{id:'s0',documentId:req.documentId,title:'Forged title',offset:999,quote:'Forged quote'}]};
    yield {type:'tool-call',call:{toolCallId:'present-1',toolName:'present',args:{title:'Comparison',columns:['Topic','Fact'],rows:[['Study','Exact passage']]}}};
    yield {type:'text-delta',text:'Supported [[cite:s0]]; unknown [[cite:s999]]'};
    yield {type:'done'};
    yield {type:'reasoning-delta',text:'late'};
  }});
  fixture.store.settings.set({...fixture.store.settings.get(),enableGenerativeUI:true});
  fixture.chat.start(fixture.request,fixture.owner);
  await until(() => fixture.owner.events.some(e => e.type === 'done'));
  const parts=fixture.store.messages.list(fixture.request.conversationId).at(-1)!.parts[0]!;
  expect(parts.reasoning).toBe('Reported summary');
  expect(parts.citations).toEqual([{id:'s0',documentId:fixture.request.documentId,title:'Study',offset:0,quote:'# Study\nExact selected passage'}]);
  expect(parts.toolCalls).toEqual([{toolCallId:'present-1',toolName:'present',args:{title:'Comparison',columns:['Topic','Fact'],rows:[['Study','Exact passage']]},result:{rendered:true},isError:false}]);
  expect(fixture.owner.events.filter(e => e.type === 'done' || e.type === 'error')).toEqual([{type:'done'}]);
  expect(fixture.owner.events.at(-1)).toEqual({type:'done'});
});
it('keeps tool execution off by default and drops enrichment after abort', async () => {
  let release = () => {};
  const fixture = await setup({...available,async *stream(req) {
    expect(req.allowPresentation).toBe(false);
    yield {type:'reasoning-delta',text:'Partial summary'};
    await new Promise<void>(resolve => {release=resolve;});
    yield {type:'tool-call',call:{toolCallId:'late',toolName:'present',args:{}}};
    yield {type:'done'};
  }});
  fixture.chat.start(fixture.request,fixture.owner);
  await until(() => fixture.owner.events.some(e => e.type === 'reasoning-delta'));
  fixture.chat.abort(fixture.request.requestId,fixture.owner);
  const events=[...fixture.owner.events];release();await new Promise(resolve => setTimeout(resolve,15));
  expect(fixture.owner.events).toEqual(events);
  expect(events.filter(e => e.type === 'done' || e.type === 'error')).toEqual([{type:'done'}]);
  const part=fixture.store.messages.list(fixture.request.conversationId).at(-1)!.parts[0]!;
  expect(part.reasoning).toBe('Partial summary');expect(part.status).toBe('aborted');expect(part.toolCalls).toBeUndefined();
});

it('reloads only edited turns and regenerates without duplicating the user, retaining audit and usage', async () => {
  const prompts: string[] = [];
  const {chat,store,request,owner,cwd} = await setup({...available, async *stream(req) {
    prompts.push(req.prompt);
    yield {type:'text-delta',text:`Answer ${prompts.length}`};
    yield {type:'done'};
  }});
  const send = async (text: string, turnId: string, contextTurnIds: string[]) => {
    const count = owner.events.filter(e => e.type === 'done').length;
    chat.start({...request,requestId:randomUUID() as typeof request.requestId,userMessage:text,turnId,contextTurnIds},owner);
    await until(() => owner.events.filter(e => e.type === 'done').length > count);
  };
  await send('Original question','turn-one',[]);
  await send('Later question','turn-two',['turn-one']);
  await send('Edited question','turn-one',[]);
  expect(store.messages.list(request.conversationId).map(m => [m.role,m.parts[0]?.text])).toEqual([['user','Edited question'],['assistant','Answer 3']]);
  await send('Edited question','turn-one',[]);
  expect(store.messages.list(request.conversationId).map(m => [m.role,m.parts[0]?.text])).toEqual([['user','Edited question'],['assistant','Answer 4']]);
  expect(prompts[2]).not.toContain('Original question');
  expect(prompts[2]).not.toContain('Later question');
  expect(prompts[3]).not.toContain('Answer 3');
  expect(store.db.prepare('SELECT count(*) AS n FROM messages WHERE supersededBy IS NOT NULL').get()?.n).toBe(5);
  expect(store.db.prepare('SELECT count(*) AS n FROM messages WHERE parentMessageId IS NOT NULL').get()?.n).toBe(4);
  expect(store.usage.forConversation(request.conversationId)).toHaveLength(4);
  expect(store.messages.page(request.conversationId,100).items.map(m => m.parts[0]?.text)).toEqual(['Edited question','Answer 4']);
  const snapshot = join(cwd,'restart.sqlite');
  store.db.prepare('VACUUM INTO ?').run(snapshot);
  const restarted = openStore(snapshot);
  expect(restarted.messages.list(request.conversationId).map(m => [m.role,m.parts[0]?.text])).toEqual([['user','Edited question'],['assistant','Answer 4']]);
  expect(restarted.usage.forConversation(request.conversationId)).toHaveLength(4);
  restarted.close();
});
