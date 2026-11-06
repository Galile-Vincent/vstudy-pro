/**
 * Regression coverage for providers agy.
 * Owned by main/providers.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { AgyAdapter, agyError, agyResult, agyUpdate, runAgy } from "./agy";
import { chatRequestSchema, type ChatEvent } from "../../shared/domain";
const request = { ...chatRequestSchema.parse({ requestId: "00000000-0000-4000-8000-000000000001", conversationId: "00000000-0000-4000-8000-000000000002", documentId: "00000000-0000-4000-8000-000000000003", providerId: "agy-cli", modelId: "gemini-3.8-flash-low", userMessage: "Hi" }), prompt: "Reply with exactly VSTUDY_ADAPTER_OK. Do not use tools." };
async function collect<T>(source: AsyncIterable<T>) { const result: T[] = []; for await (const event of source) result.push(event); return result; }
const fixture = new URL("./fixtures/agy-acp.jsonl", import.meta.url);
it("parses the captured real ACP answer and usage, without echoing user input", async () => {
  const lines = (await readFile(fixture, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const events = lines.flatMap(value => value.method === "session/update" ? agyUpdate(value.params, "fixture-session") : value.id === 4 ? agyResult(value.result) : []);
  expect(events).toEqual([{ type: "text-delta", text: "VSTUDY_ACP_OK" }, { type: "usage", usage: { inputTokens: 7705, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costSource: "unknown" } }, { type: "done" }]);
  expect(agyUpdate({ sessionId: "other", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hidden" } } }, "fixture-session")).toEqual([]);
});
it.each([["UNAUTHENTICATED private-token", "not logged in"], ["RESOURCE_EXHAUSTED private-prompt", "rate limited"], ["429 secret", "rate limited"], ["broken secret", "protocol"]])("categorizes %s without leaking details", (input, category) => {
  const error = agyError(input); expect(error.category).toBe(category); expect(error.message).not.toMatch(/private|secret/);
});
it("detects a missing binary and labels fallback models", async () => {
  const adapter = new AgyAdapter({ findBinary: async () => null });
  expect(await adapter.detect()).toEqual({ available: false, reason: "agy: binary missing" });
  expect(await adapter.listModels()).toHaveLength(6);
  expect((await adapter.listModels())[0]?.name).toContain("static fallback");
});
function fake(script: string) { return { findBinary: async () => process.execPath, args: ["-e", script], timeoutMs: 2000 }; }
const responder = (body: string) => `const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line', line=>{const m=JSON.parse(line); const send=(v)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...v})+'\\n');${body}});`;
it("probes sign-in without launching interactive authentication, enumerates and caches models", async () => {
  const adapter = new AgyAdapter(fake(responder(`if(m.method==='initialize')send({result:{}});else if(m.method==='session/new')send({result:{sessionId:'s',models:{availableModels:[{modelId:'live',name:'Live'}]}}});else if(m.method==='authenticate')throw Error('interactive login forbidden');`)));
  expect(await adapter.detect()).toEqual({ available: true });
  expect(await adapter.listModels()).toEqual([{ id: "live", name: "Live" }]);
});
it("returns a sign-in hint from a real protocol error", async () => {
  const adapter = new AgyAdapter(fake(responder(`send({error:{code:-32000,message:'Authentication required: secret'}});`)));
  expect(await adapter.detect()).toEqual({ available: false, reason: "agy: run `agy` once to sign in" });
});
it("rejects tool requests", () => {
  expect(() => agyUpdate({ sessionId: "s", update: { sessionUpdate: "tool_call" } }, "s")).toThrow("tools disabled");
});
it("kills a stubborn process group and drops buffered and post-abort deltas", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "agy-abort-test-"));
  const controller = new AbortController();
  const script = responder(`process.on('SIGTERM',()=>{});if(m.method==='initialize')send({result:{}});if(m.method==='session/new')send({result:{sessionId:'s'}});if(m.method==='session/set_model')send({result:{}});if(m.method==='session/prompt'){setInterval(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'tick'}}}})+'\\n'),10);}`);
  const events: unknown[] = [];
  try {
    for await (const event of runAgy(process.execPath, ["-e", script], cwd, request, controller.signal, 2000)) { events.push(event); if (!Array.isArray(event) && event.type === "text-delta") controller.abort(); }
    expect(events).toEqual([{ type: "text-delta", text: "tick" }, { type: "done" }]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
it("bounds hangs and emits exactly one sanitized terminal error", async () => {
  const adapter = new AgyAdapter({ ...fake("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"), timeoutMs: 100 });
  expect(await collect(adapter.stream(request, new AbortController().signal))).toEqual([{ type: "error", message: "agy: timeout" }]);
});
it("rejects truncated and malformed streams", async () => {
  for (const script of ["process.stdout.write('not json\\n')", ""]) {
    const events = await collect(new AgyAdapter(fake(script)).stream(request, new AbortController().signal));
    expect(events).toEqual([{ type: "error", message: "agy: protocol" }]);
  }
});
it.skipIf(process.env.VSTUDY_REAL_AGY !== "1")("real installed ACP adapter probe and streamed chat", async () => {
  const adapter = new AgyAdapter();
  expect(await adapter.detect()).toEqual({ available: true });
  expect((await adapter.listModels()).some(m => m.id === request.modelId)).toBe(true);
  const events: ChatEvent[] = await collect(adapter.stream(request, new AbortController().signal));
  expect(events.filter(e => e.type === "text-delta").map(e => e.text).join("")).toContain("VSTUDY_ADAPTER_OK");
  expect(events.at(-1)).toEqual({ type: "done" });
  expect(events.some(e => e.type === "usage")).toBe(true);
}, 140_000);
it("suppresses duplicate terminals and trailing output in a successful stream", async () => {
  const adapter = new AgyAdapter(fake(responder(`if(m.method==='initialize')send({result:{}});if(m.method==='session/new')send({result:{sessionId:'s'}});if(m.method==='session/set_model')send({result:{}});if(m.method==='session/prompt'){send({result:{stopReason:'end_turn'}});send({result:{stopReason:'end_turn'}});}`)));
  const controller = new AbortController();
  const events: ChatEvent[] = [];
  for await (const event of adapter.stream(request, controller.signal)) { events.push(event); controller.abort(); }
  expect(events).toEqual([{ type: "done" }]);
});
it('removes a pending probe directory when disposed before the handshake completes', async () => {
 const {readdir}=await import('node:fs/promises');
 const before=new Set(await readdir(tmpdir()));
 const adapter=new AgyAdapter(fake('setInterval(()=>{},1000)'));
 const pending=adapter.detect();
 let created:string[]=[];
 for(let i=0;i<100;i++) {
  created=(await readdir(tmpdir())).filter(name=>name.startsWith('vstudy-agy-probe-')&&!before.has(name));
  if(created.length)break;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 expect(created).toHaveLength(1);
 await adapter.dispose();
 expect((await readdir(tmpdir())).filter(name=>created.includes(name))).toEqual([]);
 await pending;
});
