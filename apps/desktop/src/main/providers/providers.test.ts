/**
 * Regression coverage for providers providers.
 * Owned by main/providers.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiAdapter, validateBaseUrl } from "./api";
import { createCliAdapter, cliArgs, cliEnvironment, findCli, runCli } from "./cli";
import { createProviderRegistry } from "./index";
import { chatRequestSchema } from "../../shared/domain";
const request = {
  ...chatRequestSchema.parse({
    requestId: "00000000-0000-4000-8000-000000000001",
    conversationId: "00000000-0000-4000-8000-000000000002",
    documentId: "00000000-0000-4000-8000-000000000003",
    providerId: "openai-api",
    modelId: "custom-model",
    userMessage: "Question",
  }),
  prompt: "Selected passage",
};
afterEach(() => vi.unstubAllEnvs());
it("rejects insecure remote endpoints and credential-bearing URLs", () => {
  for (const url of [
    "http://example.com/v1",
    "https://key@example.com",
    "file:///tmp",
    "http://localhost.evil/v1",
  ])
    expect(() => validateBaseUrl(url)).toThrow();
  expect(validateBaseUrl("http://localhost:123/v1/")).toBe(
    "http://localhost:123/v1",
  );
  expect(validateBaseUrl("https://example.com/v1")).toBe(
    "https://example.com/v1",
  );
});
it("scrubs inherited tokens and supplies shell-free restricted CLI argv", () => {
  const env = cliEnvironment({
    HOME: "/home/test",
    PATH: "/usr/bin",
    OPENAI_API_KEY: "secret",
    NODE_OPTIONS: "--require evil",
    CLAUDECODE: "nested",
  });
  expect(env.HOME).toBe("/home/test");
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(cliArgs("claude", "default")).toContain("--tools");
  expect(cliArgs("codex", "default")).toContain("read-only");
});
it("sends assembled prompt and key only in main HTTP request and lists custom model ids", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "custom-model" }] })),
    )
    .mockResolvedValueOnce(
      new Response(
        'data: {"choices":[{"delta":{"content":"yes"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
  const adapter = createApiAdapter(
    () => ({ id: "openai-api", kind: "api", enabled: true }),
    { getInMainOnly: () => "private-key" },
    fetcher,
  );
  expect(await adapter.listModels()).toEqual([
    { id: "custom-model", name: "custom-model", supportsImages:false },
  ]);
  expect(
    await collect(adapter.stream(request, new AbortController().signal)),
  ).toEqual([{ type: "text-delta", text: "yes" }, { type: "usage", usage: { inputTokens: Math.ceil(request.prompt.length / 4), outputTokens: 1, costSource: "estimated" } }, { type: "done" }]);
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain("Selected passage");
});
it("rejects truncated HTTP streams", async () => {
  const adapter = createApiAdapter(
    () => ({ id: "openai-api", kind: "api", enabled: true }),
    { getInMainOnly: () => "key" },
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('data: {"choices":[]}\n\n')),
  );
  await expect(
    collect(adapter.stream(request, new AbortController().signal)),
  ).rejects.toThrow("unexpectedly");
});
it("only enables fake in explicit E2E mode", async () => {
  const secrets = {
    preflight: async () => {}, getInMainOnly: async () => null,
    has: () => false,
    set: async () => {},
      bindCompatibleOrigin: () => {},
      useInSession: () => {},
      isUnlocked: () => false,
    delete: () => {},
  };
  vi.stubEnv("VSTUDY_FAKE_PROVIDER", "0");
  expect(
    await createProviderRegistry(secrets).get("anthropic-api").detect(),
  ).toEqual({ available: false, reason: "Add an API key" });
  vi.stubEnv("VSTUDY_FAKE_PROVIDER", "1");
  const fake = createProviderRegistry(secrets).get("anthropic-api");
  const events = await collect(
    fake.stream(request, new AbortController().signal),
  );
  expect(events).toContainEqual({
    type: "text-delta",
    text: "**bold**\n\n- First\n- Second\n\n```text\nSelected passage\n```",
  });
});
it("kills a real subprocess on abort and on timeout", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-cli-test-"));
  try {
    const controller = new AbortController();
    const aborted = collect(
      runCli(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        "",
        cwd,
        "codex",
        controller.signal,
      ),
    );
    setTimeout(() => controller.abort(), 50);
    await expect(aborted).rejects.toThrow();
    await expect(
      collect(
        runCli(
          process.execPath,
          ["-e", "setInterval(() => {}, 1000)"],
          "",
          cwd,
          "codex",
          new AbortController().signal,
          50,
        ),
      ),
    ).rejects.toThrow("Provider request timed out");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
for (const kind of ["claude", "codex"] as const)
  it.skipIf(process.env.VSTUDY_REAL_CLI_SMOKE !== "1")(`real ${kind} smoke`, async context => {
    if (!(await findCli(kind))) { context.skip(); return; }
    const adapter = createCliAdapter(kind);
    if (!(await adapter.detect()).available) { context.skip(); return; }
    const events = await collect(adapter.stream({ ...request, providerId: kind === 'codex' ? 'codex-cli' : 'claude-cli', modelId: 'default', prompt: 'Reply with exactly VSTUDY_OK. Do not use any tools.' }, new AbortController().signal));
    expect(events.flatMap(e => e.type === 'text-delta' ? [e.text] : []).join('')).toContain('VSTUDY_OK');
    expect(events.at(-1)).toEqual({ type: 'done' });
  }, 140_000);

for (const newline of ['', '\n']) it(`rejects native Codex tool events with ${newline ? 'a' : 'no'} final newline`, async () => {
  const record = JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'cat secret' } }) + newline;
  await expect(collect(runCli(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(record)})`], '', tmpdir(), 'codex', new AbortController().signal))).rejects.toThrow('Provider unavailable');
});

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of source) result.push(value);
  return result;
}
it("allows loopback compatible providers without credentials", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('data: [DONE]\n\n'));
  const adapter = createApiAdapter(() => ({ kind: "compatible", id: "openai-compatible", enabled: true, baseUrl: "http://127.0.0.2:123/v1" }), { getInMainOnly: async () => null }, fetcher);
  expect(await adapter.detect()).toEqual({ available: true });
  expect(await collect(adapter.stream(request, new AbortController().signal))).toEqual([{ type: "usage", usage: { inputTokens: Math.ceil(request.prompt.length / 4), outputTokens: 0, costSource: "estimated" } }, { type: "done" }]);
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ "content-type": "application/json" });
});
it.each([
  [401, 'Authentication failed. Check the API key in Settings.'],
  [429, 'Provider rate limited. Try again shortly.'],
  [529, 'Provider rate limited. Try again shortly.'],
  [400, 'Provider rejected the request. Check the model and settings.'],
  [500, 'Provider server error (HTTP 500). Try again.'],
  [408, 'Provider request timed out (HTTP 408). Try again.'],
  [409, 'Provider temporarily unavailable (HTTP 409). Try again.'],
  [425, 'Provider temporarily unavailable (HTTP 425). Try again.'],
] as const)('categorizes HTTP %s without exposing response or key', async (status, message) => {
  const adapter = createApiAdapter(() => ({ kind: 'api', id: 'openai-api', enabled: true }), { getInMainOnly: () => 'private-key' }, async () => new Response('private-key', { status }));
  await expect(collect(adapter.stream(request, new AbortController().signal))).rejects.toThrow(message);
});
it.each([
  ['claude', { type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'Not logged in · Please run /login' }] } }, 'Authentication failed. Run `claude` and /login.'],
  ['claude', { type: 'result', is_error: true, result: 'Not logged in · Please run /login' }, 'Authentication failed. Run `claude` and /login.'],
  ['codex', { type: 'error', message: 'unexpected status 401 Unauthorized' }, 'Authentication failed. Run `codex login`.'],
] as const)('classifies %s JSON stdout authentication failures with empty stderr', async (kind, fixture, message) => {
  await expect(collect(runCli(process.execPath, ['-e', `console.log(${JSON.stringify(JSON.stringify(fixture))})`], '', tmpdir(), kind, new AbortController().signal))).rejects.toThrow(message);
});
it("discovers only on request, awaits results, and observes the TTL without background refresh", async () => {
  const { ProviderRegistry } = await import("./index");
  const registry = new ProviderRegistry();
  let calls = 0, detects = 0;
  registry.register("claude-cli", { async detect() { detects++; return {available:true}; }, async listModels() { calls++; return [{id:'arrived',name:'Arrived'}]; }, async *stream() { yield {type:'done'}; } });
  registry.configure({kind:'cli',id:'claude-cli',enabled:true});
  await registry.list(false);
  expect([calls,detects]).toEqual([0,0]);
  expect((await registry.list()).find(p => p.config.id === 'claude-cli')?.models).toEqual([{id:'arrived',name:'Arrived'}]);
  await registry.list(false);
  await registry.list();
  expect(calls).toBe(1);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 62_000);
  try {
    await registry.list(false);
    expect(calls).toBe(1);
    await registry.list(true);
    expect(calls).toBe(2);
  } finally { clock.mockRestore(); }
});
for (const kind of ["claude", "codex"] as const) it(`drops buffered ${kind} output and kills a process that writes after SIGTERM`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-stubborn-cli-"));
  const controller = new AbortController();
  const line = kind === "codex" ? { type: "item.completed", item: { type: "agent_message", text: "tick" } } : { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "tick" } } };
  const script = `process.stdout.on('error', () => {}); process.on('SIGTERM', () => {}); setInterval(() => process.stdout.write(${JSON.stringify(JSON.stringify(line) + '\n')}), 10);`;
  const events: unknown[] = [];
  try {
    await expect((async () => {
      for await (const event of runCli(process.execPath, ["-e", script], "", cwd, kind, controller.signal)) {
        events.push(event); controller.abort();
      }
    })()).rejects.toThrow();
    expect(events).toEqual([{ type: "text-delta", text: "tick" }]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

it('discovers saved-key availability without unlocking the Keychain or fetching models', async () => {
  const getInMainOnly = vi.fn(async () => { throw new Error('Keychain must remain lazy'); });
  const fetcher = vi.fn<typeof fetch>();
  const adapter = createApiAdapter(() => ({kind:'api',id:'openai-api',enabled:true}), {getInMainOnly,has:()=>true,isUnlocked:()=>false}, fetcher);
  expect(await adapter.detect()).toEqual({available:true});
  expect(await adapter.listModels()).toEqual([]);
  expect(getInMainOnly).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it('kills a TERM-resistant descendant even when its CLI parent exits on TERM',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'vstudy-cli-descendant-'));let pid:number|undefined;
 const line={type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'tick'}}};
 const script=`const child=require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});require('node:fs').writeFileSync('pid',String(child.pid));child.on('message',()=>console.log(${JSON.stringify(JSON.stringify(line))}));setInterval(()=>{},1000);`;
 const controller=new AbortController();
 try {
  await expect((async()=>{for await(const event of runCli(process.execPath,['-e',script],'',cwd,'claude',controller.signal)){if(event.type==='text-delta')controller.abort();}})()).rejects.toThrow();
  const {readFile}=await import('node:fs/promises');pid=Number(await readFile(join(cwd,'pid'),'utf8'));
  await vi.waitFor(()=>expect(()=>process.kill(pid!,0)).toThrow(),{timeout:500});
 } finally {if(pid)try{process.kill(pid,'SIGKILL');}catch{/* Already reaped. */}await rm(cwd,{recursive:true,force:true});}
});

it('serializes image input with separate system instructions and no tools for both APIs',async()=>{
 for(const id of ['anthropic-api','openai-api'] as const) {
  let body:Record<string,unknown>={};
  const fetcher:typeof fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response('data: [DONE]\n\n',{status:200});};
  const adapter=createApiAdapter(()=>({id,kind:'api',enabled:true}),{getInMainOnly:()=> 'fixture-key'},fetcher);
  try {for await(const event of adapter.stream({...request,providerId:id,systemPrompt:'SYSTEM_ONLY',images:[{mediaType:'image/png',data:'AA=='}]},new AbortController().signal)){void event;}}catch { /* This assertion concerns the outgoing body, not the intentionally empty stream. */ }
  expect(body.tools).toBeUndefined();expect(JSON.stringify(body)).toContain(id==='anthropic-api'?'"type":"image"':'data:image/png;base64,AA==');
  const messages=body.messages as {role:string;content:unknown}[];
  if(id==='anthropic-api')expect(body.system).toBe('SYSTEM_ONLY');else expect(messages[0]).toEqual({role:'system',content:'SYSTEM_ONLY'});
 }
});

it('preserves transport timeout classification without response details',async()=>{
  const {classifyError}=await import('../analytics/provider');
  const adapter=createApiAdapter(()=>({kind:'api',id:'openai-api',enabled:true}),{getInMainOnly:()=> 'test'},async()=>{throw new DOMException('private timeout detail','TimeoutError');});
  try {await collect(adapter.stream(request,new AbortController().signal));throw new Error('expected failure');}
  catch(error){expect(classifyError(error)).toBe('timeout');expect(String(error)).not.toContain('private timeout detail');}
});
