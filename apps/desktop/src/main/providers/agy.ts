/**
 * Adapt Antigravity ACP processes to the shared chat event protocol.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { terminateProcess } from '../platform/process';
import { recordEgress } from '../services/egress';
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ChatEvent, Usage } from "../../shared/domain";
import type { Availability, Model, ProviderAdapter, ProviderRequest } from "./index";
import { cliEnvironment, findCli } from "./cli";

export type AgyErrorCategory = "binary missing" | "not logged in" | "rate limited" | "timeout" | "protocol" | "tools disabled";
/** Expose a categorized ACP failure without raw provider process output. */
export class AgyError extends Error {
  constructor(readonly category: AgyErrorCategory) {
    super(category === "not logged in" ? "agy: run `agy` once to sign in" : `agy: ${category}`);
  }
}
/** Classify Antigravity failures without exposing raw process output. */
export function agyError(value: unknown): AgyError {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return new AgyError(/429|RESOURCE_EXHAUSTED|rate.?limit|quota.exceeded/i.test(text) ? "rate limited"
    : /401|403|auth|sign.?in|log.?in|credential/i.test(text) ? "not logged in" : "protocol");
}
const defaults = ["gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium"];
// ACP's disabledTools extension removes native tools before a document prompt reaches the model.
const disabledTools = "ask_custom_permission ask_permission ask_question browser_click_element browser_drag_pixel_to_pixel browser_get_dom browser_get_network_request browser_input browser_list_network_requests browser_mouse_down browser_mouse_up browser_move_mouse browser_press_key browser_refresh_page browser_resize_window browser_scroll browser_scroll_dom browser_select_option browser_subagent call_mcp_tool capture_browser_console_logs capture_browser_screenshot click_browser_pixel command_status define_subagent delete_knowledge execute_browser_javascript find_by_name finish generate_image grep_search invoke_subagent list_browser_pages list_dir list_permissions list_plugin_accounts list_resources manage_inbox manage_subagents manage_task multi_replace_file_content notebook_edit notebook_execution open_browser_url read_browser_page read_resource read_url_content replace_file_content run_command run_workflow schedule search_marketplace search_web sed_file send_command_input send_message view_file wait wait_5_seconds write_to_file".split(" ");
export const agyArgs = ["acp", "--stdio", "--sandbox", "--include-default-customizations=false"];
const messageSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.number(), z.string()]).optional(), method: z.string().optional(), params: z.unknown().optional(), result: z.unknown().optional(), error: z.unknown().optional() });
const updateSchema = z.object({ sessionId: z.string(), update: z.object({ sessionUpdate: z.string(), content: z.object({ type: z.string(), text: z.string().optional() }).optional() }) });
const resultSchema = z.object({ stopReason: z.string(), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), cachedReadTokens: z.number().int().nonnegative().optional(), cachedWriteTokens: z.number().int().nonnegative().optional(), thoughtTokens: z.number().int().nonnegative().optional() }).optional() });
/** Translate supported ACP updates into shared chat events. */
export function agyUpdate(params: unknown, sessionId: string): ChatEvent[] {
  const { update, sessionId: source } = updateSchema.parse(params);
  if (source !== sessionId) return [];
  if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") throw new AgyError("tools disabled");
  return update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text" && update.content.text
    ? [{ type: "text-delta", text: update.content.text }] : [];
}
/** Normalize the terminal ACP result into usage and completion events. */
export function agyResult(value: unknown): ChatEvent[] {
  const result = resultSchema.parse(value);
  if (!["end_turn", "max_tokens"].includes(result.stopReason)) throw new AgyError("protocol");
  const usage: Usage | undefined = result.usage && { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheReadTokens: result.usage.cachedReadTokens, cacheWriteTokens: result.usage.cachedWriteTokens, reasoningTokens: result.usage.thoughtTokens, costSource: "unknown" };
  return [...(usage ? [{ type: "usage" as const, usage }] : []), { type: "done" }];
}
interface Options { findBinary?: () => Promise<string | null>; timeoutMs?: number; args?: string[] }

/** Run one bounded ACP session and tear down its process on completion or cancellation. */
export async function* runAgy(binary: string, args: string[], cwd: string, request: ProviderRequest | undefined, signal: AbortSignal, timeoutMs: number): AsyncIterable<ChatEvent | Model[]> {
  if (signal.aborted) { yield { type: "done" }; return; }
  recordEgress(request ? 'agy_chat' : 'agy_discovery', 'Google / Antigravity CLI managed endpoints');
  const child = spawn(binary, args, { cwd, env: cliEnvironment(), shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
  let failure: AgyError | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let terminal = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let stderr = "";
  const terminate = (signal: NodeJS.Signals) => {
    void terminateProcess(child, signal);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (sessionId && child.stdin.writable) send({ method: "session/cancel", params: { sessionId } });
    terminate("SIGTERM");
    killTimer = setTimeout(() => terminate("SIGKILL"), 150);
    child.stdout.destroy();
  };
  const closed = new Promise<void>(resolve => {
    child.once("error", () => { failure = new AgyError("binary missing"); child.stdout.destroy(); resolve(); });
    child.once("close", () => { if (!stopped && !failure) failure = agyError(stderr); resolve(); });
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data: string) => { stderr = (stderr + data).slice(-8192); });
  child.stdin.on("error", () => {});
  function send(message: object) { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n"); }
  const timer = setTimeout(() => { failure = new AgyError("timeout"); stop(); }, timeoutMs);
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  else send({ id: 1, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "zed", version: "0.0.0" }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } });
  child.stdout.setEncoding("utf8");
  let buffer = "";
  try {
    for await (const chunk of child.stdout) {
      if (signal.aborted || failure) break;
      buffer += chunk;
      if (buffer.length > 2_000_000) throw new AgyError("protocol");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        if (signal.aborted || failure) break;
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const value = messageSchema.parse(JSON.parse(line));
        if (value.error) throw agyError(value.error);
        if (value.method && value.id !== undefined) {
          send(value.method === "session/request_permission" ? { id: value.id, result: { outcome: { outcome: "cancelled" } } } : { id: value.id, error: { code: -32601, message: "Tools are disabled" } });
          throw new AgyError("tools disabled");
        }
        if (value.method === "session/update" && sessionId) {
          for (const event of agyUpdate(value.params, sessionId)) { if (signal.aborted) break; yield event; }
        } else if (value.id === 1) {
          // session/new uses the CLI's existing login; authenticate can open a browser and must not run in a probe.
          send({ id: 2, method: "session/new", params: { cwd, mcpServers: [], _meta: { antigravity: { disabledTools } } } });
        } else if (value.id === 2) {
          const setup = z.object({ sessionId: z.string(), models: z.object({ availableModels: z.array(z.object({ modelId: z.string(), name: z.string() })) }).optional() }).parse(value.result);
          sessionId = setup.sessionId;
          if (!request) { yield setup.models?.availableModels.map(m => ({ id: m.modelId, name: m.name })) ?? []; return; }
          send({ id: 3, method: "session/set_model", params: { sessionId, modelId: request.modelId } });
        } else if (value.id === 3 && request) {
          send({ id: 4, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: "Answer using only the supplied text. Do not use tools or ask for permissions.\n\n" + request.prompt }] } });
        } else if (value.id === 4 && request) {
          for (const event of agyResult(value.result)) {
            if (signal.aborted) break;
            if (event.type === "usage") request.onUsageSnapshot?.(event.usage);
            if (event.type === "done") terminal = true;
            yield event;
          }
          if (signal.aborted && !terminal) yield { type: "done" };
          return;
        }
      }
    }
    if (signal.aborted) yield { type: "done" };
    else throw failure ?? agyError(stderr);
  } catch (error) {
    if (signal.aborted) yield { type: "done" };
    else yield { type: "error", message: (failure ?? (error instanceof AgyError ? error : new AgyError("protocol"))).message };
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", stop);
    stop(); await closed;
    if (killTimer) clearTimeout(killTimer);
    // The leader may exit before a stubborn descendant; still terminate its process group.
    await terminateProcess(child, "SIGKILL");
  }
}

/** Adapt opted-in ACP sessions to the shared provider contract. */
export class AgyAdapter implements ProviderAdapter {
  private cache?: { expires: number; availability: Availability; models: Model[] };
  private pending: Promise<NonNullable<AgyAdapter["cache"]>> | undefined;
  private readonly probeController = new AbortController();
  private readonly onExit = () => { this.probeController.abort(); };
  constructor(private readonly options: Options = {}) { process.once('exit',this.onExit); }
  async dispose(): Promise<void> {
    this.probeController.abort();
    process.removeListener('exit',this.onExit);
    await this.pending;
  }
  private binary() { return (this.options.findBinary ?? (() => findCli("agy")))(); }
  private async probe() {
    if (this.cache && this.cache.expires > Date.now()) return this.cache;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const binary = await this.binary();
      let availability: Availability = { available: false, reason: new AgyError("binary missing").message };
      let models: Model[] = [];
      if (binary) {
        const cwd = await mkdtemp(join(tmpdir(), "vstudy-agy-probe-"));
        try {
          for await (const event of runAgy(binary, this.options.args ?? agyArgs, cwd, undefined, this.probeController.signal, this.options.timeoutMs ?? 10_000)) {
            if (Array.isArray(event)) { models = event; availability = { available: true }; }
            else if (event.type === "error") availability = { available: false, reason: event.message };
          }
        } finally { await rm(cwd, { recursive: true, force: true, maxRetries: 3 }); }
      }
      return this.cache = { expires: Date.now() + 60_000, availability, models };
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  async detect() { return (await this.probe()).availability; }
  async listModels() {
    const { models } = await this.probe();
    return models.length ? models : defaults.map(id => ({ id, name: `${id} (static fallback)` }));
  }
  async *stream(request: ProviderRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const binary = await this.binary();
    if (!binary) { yield { type: "error", message: new AgyError("binary missing").message }; return; }
    const cwd = await mkdtemp(join(tmpdir(), `vstudy-agy-${request.conversationId}-`));
    try {
      for await (const event of runAgy(binary, this.options.args ?? agyArgs, cwd, request, signal, this.options.timeoutMs ?? 120_000)) if (!Array.isArray(event)) yield event;
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
}
