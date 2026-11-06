/**
 * Regression coverage for services chat.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
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
  const chat = new ChatService(store, registry, cwd);
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
    await chat.dispose();
    store.close();
    await rm(cwd, { recursive: true, force: true });
  });
  if (request.scope === "course" || request.scope === "general") throw new Error("Expected document fixture");
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
  expect(received?.prompt).toContain('Document: "Study"');
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
  await chat.waitForIdle();
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
  await chat.waitForIdle();
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
  await chat.waitForIdle();
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
  await chat.waitForIdle();
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
  await chat.waitForIdle();expect(owner.events).toHaveLength(3);
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
    if (req.scope === 'course' || req.scope === 'general') throw new Error('Expected document fixture');
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
  expect(parts.citations).toEqual([{version:'original',id:'s0',documentId:fixture.request.documentId,title:'Study',offset:0,quote:'# Study\nExact selected passage'}]);
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
  const events=[...fixture.owner.events];release();await fixture.chat.waitForIdle();
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

it.each(['messages', 'activity_events'])('rolls back a failed edit when %s insertion aborts', async (table) => {
  const { chat, store, request, owner } = await setup({ ...available, async *stream() { yield { type: 'done' }; } });
  const user = store.messages.insert({id: randomUUID() as never, conversationId: request.conversationId, role:'user', parts:[{type:'text',text:'original'}], createdAt:new Date().toISOString()});
  store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'assistant',parts:[{type:'text',text:'valuable answer'}],createdAt:new Date(Date.now()+1).toISOString()});
  const before = store.messages.list(request.conversationId);
  store.db.exec(`CREATE TRIGGER reject_edit BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END`);
  expect(() => chat.start({...request,turnId:user.id,userMessage:'edited'},owner)).toThrow('simulated storage failure');
  expect(store.messages.list(request.conversationId)).toEqual(before);
});

it('awaits provider cleanup and persists partial text and usage before disposal resolves', async () => {
  const exited = deferred<void>();
  const started = deferred<void>();
  const fixture = await setup({...available,async *stream(_req,signal) {
    try {
      yield {type:'text-delta',text:'partial answer'};
      yield {type:'usage',usage:{inputTokens:10,outputTokens:3,costSource:'reported'}};
      started.resolve();
      await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
    } finally { await exited.promise; }
  }});
  fixture.chat.start(fixture.request,fixture.owner);await started.promise;
  let disposed=false;
  const disposal=Promise.resolve(fixture.chat.dispose()).then(()=>{disposed=true;});
  await new Promise<void>(resolve=>setImmediate(resolve));
  expect(disposed).toBe(false);
  expect(fixture.store.messages.list(fixture.request.conversationId).at(-1)?.parts[0]).toMatchObject({text:'partial answer',status:'aborted',usage:{inputTokens:10,outputTokens:3}});
  exited.resolve();await disposal;
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise,resolve};
}

it('restores the original branch on an enclosing crash-simulated rollback', async () => {
 const {chat,store,request,owner}=await setup({...available,async *stream(){yield {type:'done'};}});
 const user=store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'user',parts:[{type:'text',text:'original'}],createdAt:new Date().toISOString()});
 const before=store.messages.list(request.conversationId);
 store.db.exec('BEGIN IMMEDIATE');chat.start({...request,userMessage:'edited',turnId:user.id},owner);store.db.exec('ROLLBACK');
 expect(store.messages.list(request.conversationId)).toEqual(before);await chat.dispose();
});
it('keeps the previous assistant visible when regeneration is cancelled before output',async()=>{
 const gate=deferred<void>();const started=deferred<void>();
 const {chat,store,request,owner}=await setup({...available,async *stream(){started.resolve();await gate.promise;yield {type:'done'};}});
 const user=store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'user',parts:[{type:'text',text:request.userMessage}],createdAt:new Date().toISOString()});
 store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'assistant',parts:[{type:'text',text:'valuable answer'}],createdAt:new Date(Date.now()+1).toISOString()});
 const before=store.messages.list(request.conversationId);chat.start({...request,turnId:user.id},owner);await started.promise;
 expect(store.messages.list(request.conversationId)).toEqual(before);chat.abort(request.requestId,owner);gate.resolve();await chat.waitForIdle();expect(store.messages.list(request.conversationId)).toEqual(before);
});
it('rolls back all usage inserts when a later model usage write fails', async()=>{
 const {chat,store,request,owner}=await setup({...available,async *stream(req){
  yield {type:'text-delta',text:'answer'};
  req.onUsageSnapshot?.({inputTokens:10,outputTokens:2,costSource:'reported'},[{modelId:'one',usage:{inputTokens:5,outputTokens:1,costSource:'reported'}},{modelId:'two',usage:{inputTokens:5,outputTokens:1,costSource:'reported'}}]);
  yield {type:'done'};
 }});
 store.db.exec("CREATE TRIGGER reject_second_usage BEFORE INSERT ON usage_events WHEN NEW.modelId='two' BEGIN SELECT RAISE(ABORT,'storage unavailable'); END");
 chat.start(request,owner);await chat.waitForIdle();
 expect(store.db.prepare('SELECT * FROM usage_events').all()).toHaveLength(0);
 expect(store.db.prepare('SELECT * FROM usage_daily').all()).toHaveLength(0);
 expect(store.messages.list(request.conversationId).filter(m=>m.role==='assistant')).toHaveLength(0);
 expect(owner.events.at(-1)?.type).toBe('error');
});

it('rejects invalid edit options before committing any branch or activity changes',async()=>{
 const {chat,store,request,owner}=await setup({...available,async *stream(){yield {type:'done'};}});
 const user=store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'user',parts:[{type:'text',text:'original'}],createdAt:new Date().toISOString()});
 const before=store.messages.list(request.conversationId);
 await expect(Promise.resolve().then(()=>chat.start({...request,userMessage:'edited',turnId:user.id,options:{invented:'unsafe'}},owner))).rejects.toThrow('Unsupported model option');
 expect(store.messages.list(request.conversationId)).toEqual(before);
 expect(store.db.prepare('SELECT * FROM activity_events').all()).toHaveLength(0);
});
it('restores the old active branch when an accepted edit fails before output',async()=>{
 const {chat,store,request,owner}=await setup({...available,async *stream(){throw new Error('network unavailable');yield {type:'done'};}});
 const user=store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'user',parts:[{type:'text',text:'original'}],createdAt:new Date().toISOString()});
 store.messages.insert({id:randomUUID() as never,conversationId:request.conversationId,role:'assistant',parts:[{type:'text',text:'valuable answer'}],createdAt:new Date(Date.now()+1).toISOString()});
 const before=store.messages.list(request.conversationId);chat.start({...request,userMessage:'edited',turnId:user.id},owner);await chat.waitForIdle();expect(store.messages.list(request.conversationId)).toEqual(before);
});
it('persists action-only course replies and never executes a proposal', async () => {
  const fixture = await setup({...available, async *stream(req) {
    expect(req.allowPresentation).toBe(false);
    expect(req.prompt).toContain('<UNTRUSTED_COURSE_DATA>');
    yield {type:'text-delta',text:'```vstudy-action\n{"type":"export-calendar","deadlineIds":["00000000-0000-4000-8000-000000000012"]}\n```'};
    yield {type:'done'};
  }});
  const courseId = '00000000-0000-4000-8000-000000000011';
  const deadlineId = '00000000-0000-4000-8000-000000000012';
  const accountId = '00000000-0000-4000-8000-000000000013';
  const course = {id:courseId,accountId,remoteId:1,fullName:'Lab',shortName:'LAB',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false};
  fixture.store.db.prepare("INSERT INTO moodle_accounts VALUES (?,?,1,?)").run(accountId, 'https://school.example', JSON.stringify({ id: accountId, siteUrl: 'https://school.example', siteName: 'School', remoteUserId: 1, displayName: 'Student', status: 'connected', syncedAt: null }));
  fixture.store.db.prepare('INSERT INTO moodle_courses VALUES (?,?,?)').run(courseId,accountId,JSON.stringify(course));
  fixture.store.db.prepare('INSERT INTO moodle_deadlines VALUES (?,?,?)').run(deadlineId,courseId,JSON.stringify({id:deadlineId,courseId,title:'Lab report',kind:'assignment',dueAt:'2099-01-01T00:00:00Z',url:null,submitted:false}));
  const conversation = fixture.chat.createConversation({scope:'course',courseId,providerId:'anthropic-api',modelId:'fake'});
  const request = chatRequestSchema.parse({scope:'course',courseId,conversationId:conversation.id,requestId:randomUUID(),providerId:'anthropic-api',modelId:'fake',userMessage:'Plan'});
  if (request.scope !== 'course') throw new Error('Expected course fixture');
  expect(() => fixture.chat.start({...request,courseId:'00000000-0000-4000-8000-000000000099'},fixture.owner)).toThrow('Chat context mismatch');
  fixture.chat.start(request,fixture.owner);
  await fixture.chat.waitForIdle();
  expect(fixture.owner.events).toEqual([{type:'proposals',actions:[{type:'export-calendar',deadlineIds:['00000000-0000-4000-8000-000000000012']}]},{type:'done'}]);
  expect(fixture.store.messages.list(conversation.id).at(-1)?.parts[0]?.proposals).toEqual([{type:'export-calendar',deadlineIds:['00000000-0000-4000-8000-000000000012']}]);
  expect(fixture.store.db.prepare('SELECT * FROM moodle_reminders').all()).toEqual([]);
});

it("sends converted course excerpts only for an explicit material request and never applies model proposals", async () => {
  const prompts: string[] = [];
  const fixture = await setup({ ...available, async *stream(req) {
    prompts.push(req.prompt);
    yield { type: "text-delta", text: 'Read the approved notes.\n```vstudy-action\n' + JSON.stringify({ type: "create-task", task: { title: "Practice recall", courseId: "00000000-0000-4000-8000-000000000001", dueAt: null, estimateMinutes: 30 } }) + '\n```' };
    yield { type: "done" };
  } });
  const { seedStudent, id } = await import("../planner/__fixtures__/student");
  seedStudent(fixture.store);
  const documentId = fixture.request.documentId;
  const file = { id: id(30), courseId: id(1), section: "Notes", module: "Resource", name: "Study notes", mime: "text/markdown", size: 40, modifiedAt: null, documentId };
  fixture.store.db.prepare("INSERT INTO moodle_files VALUES (?,?,?,?,?)").run(file.id, file.courseId, "https://school.example/notes.md", JSON.stringify(file), documentId);
  const c = fixture.chat.createConversation({ scope: "course", courseId: id(1), providerId: "anthropic-api", modelId: "fake" });
  const request = chatRequestSchema.parse({ scope: "course", courseId: id(1), conversationId: c.id, providerId: c.providerId, modelId: c.modelId, requestId: randomUUID(), userMessage: "Help me study" });
  fixture.chat.start(request, fixture.owner); await fixture.chat.waitForIdle();
  expect(prompts[0]).not.toContain("Exact selected passage");
  fixture.chat.start(chatRequestSchema.parse({ ...request, requestId: randomUUID(), materials: { mode: "quiz", documentIds: [documentId] } }), fixture.owner);
  await fixture.chat.waitForIdle();
  expect(prompts[1]).toContain("Exact selected passage");
  expect(prompts[1]).toContain("<UNTRUSTED_MATERIALS>");
  expect(prompts[1]).toContain("Create five practice questions");
  expect(fixture.store.db.prepare("SELECT * FROM planner_tasks").all()).toEqual([]);
  expect(fixture.owner.events.some(event => event.type === "proposals" && event.actions[0]?.type === "create-task")).toBe(true);
  fixture.chat.start(chatRequestSchema.parse({ ...request, requestId: randomUUID(), materials: { mode: "summary", documentIds: [id(99)] } }), fixture.owner);
  await fixture.chat.waitForIdle();
  expect(prompts).toHaveLength(2);
  expect(fixture.owner.events.at(-1)?.type).toBe("error");
});

it("aborts a course material request when its selected document is deleted", async () => {
  let started = false, aborted = false;
  const fixture = await setup({ ...available, async *stream(_request, signal) {
    started = true;
    await new Promise<void>(resolve => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    yield { type: "done" };
  } });
  const { seedStudent, id } = await import("../planner/__fixtures__/student");
  seedStudent(fixture.store);
  const documentId = fixture.request.documentId;
  const file = { id: id(30), courseId: id(1), section: "Notes", module: "Resource", name: "Notes", mime: "text/markdown", size: 40, modifiedAt: null, documentId };
  fixture.store.db.prepare("INSERT INTO moodle_files VALUES (?,?,?,?,?)").run(file.id, file.courseId, "https://school.example/notes.md", JSON.stringify(file), documentId);
  const c = fixture.chat.createConversation({ scope: "course", courseId: id(1), providerId: "anthropic-api", modelId: "fake" });
  fixture.chat.start(chatRequestSchema.parse({ scope: "course", courseId: id(1), conversationId: c.id, providerId: c.providerId, modelId: c.modelId, requestId: randomUUID(), userMessage: "Summarize", materials: { mode: "summary", documentIds: [documentId] } }), fixture.owner);
  await until(() => started);
  await fixture.chat.deleteDocument(documentId, async () => { fixture.store.documents.delete(documentId); });
  await fixture.chat.waitForIdle();
  expect(aborted).toBe(true);
  expect(fixture.owner.events.at(-1)).toEqual({ type: "done" });
});

it("never sends Markdown outside the configured library even when both database paths are forged", async () => {
  let called=false;
  const {chat,store,request,owner,cwd}=await setup({...available,async *stream(){called=true;yield {type:"done"};}});
  const outside=await mkdtemp(join(tmpdir(),"vstudy-outside-"));
  try {
    const path=join(outside,"secret.md");await writeFile(path,"PRIVATE DATA");
    store.db.prepare("UPDATE documents SET sourcePath=?,markdownPath=? WHERE id=?").run(path,path,request.documentId);
    chat.start(request,owner);
    await until(()=>owner.events.some(e=>e.type==='error'));
    expect(called).toBe(false);
    expect(cwd).not.toBe(outside);
  } finally {await rm(outside,{recursive:true,force:true});}
});
it('reports a typed save failure while leaving the streamed answer available to copy', async () => {
  const {chat,store,request,owner}=await setup({...available,async *stream(){
    yield {type:'text-delta',text:'Answer worth keeping'};
    store.messages.insert=()=>{throw Object.assign(new Error('private path'),{code:'ENOSPC'});};
    yield {type:'done'};
  }});
  chat.start(request,owner);await chat.waitForIdle();
  expect(owner.events).toContainEqual({type:'text-delta',text:'Answer worth keeping'});
  expect(owner.events.at(-1)).toMatchObject({type:'error',code:'errors.chat_save_failed',params:{}});
  expect(store.messages.list(request.conversationId).some(m=>m.role==='assistant')).toBe(false);
});
it('rejects oversized user text before service persistence or provider work',async()=>{
  let calls=0;
  const adapter:ProviderAdapter={detect:async()=>({available:true}),listModels:async()=>[],async *stream(){calls++;yield {type:'done'};}};
  const {chat,store,request}=await setup(adapter);
  const owner=new Owner();
  expect(()=>chat.start({...request,userMessage:'x'.repeat(2_000_001)},owner)).toThrow(expect.objectContaining({name:'MessageTextLimitError',code:'errors.message_too_large'}));
  expect(store.messages.list(request.conversationId)).toEqual([]);expect(calls).toBe(0);
});
