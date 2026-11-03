import { z } from "zod";
import { cliModelUsage, extractUsage } from "./usage";
import type { Usage, ChatEvent } from "../../shared/domain";
const wireEvent = z
  .object({
    type: z.string().optional(),
    is_error: z.boolean().optional(),
    delta: z
      .object({ type: z.string().optional(), text: z.string().optional(), thinking: z.string().optional() })
      .optional(),
    event: z.unknown().optional(),
    item: z
      .object({ type: z.string(), text: z.string().optional() })
      .passthrough()
      .optional(),
    choices: z
      .array(
        z.object({
          delta: z
            .object({ content: z.string().nullable().optional() })
            .optional(),
        }),
      )
      .optional(),
  })
  .passthrough();
export type ParserKind = "anthropic" | "openai" | "claude" | "codex";
export function parseProviderEvent(
  kind: ParserKind,
  data: string,
): ChatEvent[] {
  if (data === "[DONE]") return [{ type: "done" }];
  const value = wireEvent.parse(JSON.parse(data));
  if (value.type === "error" || value.type === "turn.failed" || value.is_error)
    return [{ type: "error", message: "Provider request failed" }];
  if (kind === "claude") {
    if (value.type === "stream_event")
      return parseProviderEvent("anthropic", JSON.stringify(value.event)).filter(event => event.type !== "done");
    if (value.type === "result") return [{ type: "done" }];
  }
  if (kind === "anthropic") {
    if (value.type === 'content_block_delta' && value.delta?.type === 'thinking_delta' && value.delta.thinking) return [{type:'reasoning-delta',text:value.delta.thinking}];
    if (
      value.type === "content_block_delta" &&
      value.delta?.type === "text_delta" &&
      value.delta.text
    )
      return [{ type: "text-delta", text: value.delta.text }];
    if (value.type === "message_stop") return [{ type: "done" }];
  }
  if (kind === "openai")
    return (value.choices ?? []).flatMap((c): ChatEvent[] =>
      c.delta?.content ? [{ type: "text-delta", text: c.delta.content }] : [],
    );
  if (kind === "codex") {
    if (value.type === 'item.completed' && value.item?.type === 'reasoning' && value.item.text) return [{type:'reasoning-delta',text:value.item.text}];
    if (
      value.type === "item.completed" &&
      value.item?.type === "agent_message" &&
      value.item.text
    )
      return [{ type: "text-delta", text: value.item.text }];
    if (value.type === "turn.completed") return [{ type: "done" }];
  }
  return [];
}
export async function* parseStream(
  chunks: AsyncIterable<string>,
  kind: ParserKind,
  sse = false,
  snapshot: (usage: Usage, models?: { modelId: string; usage: Usage }[]) => void = () => {},
): AsyncIterable<ChatEvent> {
  let usage: Usage | undefined;
  let emitted = false;
  const calls = new Map<number,{id:string;name:string;text:string}>();
  function toolFrames(payload: string) {
    if (payload === '[DONE]') return;
    const value = JSON.parse(payload);
    if (kind === 'openai') for (const call of value.choices?.[0]?.delta?.tool_calls ?? []) {
      if (!Number.isInteger(call.index) || call.index < 0 || call.index > 15) throw new Error('Too many tool calls');
      const previous = calls.get(call.index) ?? {id:'',name:'',text:''};
      const next = {id: typeof call.id === 'string' ? call.id : previous.id, name: typeof call.function?.name === 'string' ? call.function.name : previous.name, text:previous.text + (typeof call.function?.arguments === 'string' ? call.function.arguments : '')};
      if (next.text.length > 100_000) throw new Error('Tool arguments too large');
      calls.set(call.index,next);
    }
    if (kind === 'anthropic' && value.type === 'content_block_start' && value.content_block?.type === 'tool_use') calls.set(value.index,{id:value.content_block.id,name:value.content_block.name,text:''});
    if (kind === 'anthropic' && value.type === 'content_block_delta' && value.delta?.type === 'input_json_delta') {
      const call = calls.get(value.index); if (call && typeof value.delta.partial_json === 'string') { call.text += value.delta.partial_json; if (call.text.length > 100_000) throw new Error('Tool arguments too large'); }
    }
    if (calls.size > 16) throw new Error('Too many tool calls');
  }
  function events(payload: string): ChatEvent[] {
    toolFrames(payload);
    usage = extractUsage(payload, kind, usage);
    const models = kind === 'claude' ? cliModelUsage(payload) : undefined;
    if (models?.length && usage) usage = { ...usage, inputTokens: models.reduce((n,m) => n + m.usage.inputTokens,0), outputTokens: models.reduce((n,m) => n + m.usage.outputTokens,0), cacheReadTokens: models.reduce((n,m) => n + (m.usage.cacheReadTokens ?? 0),0), cacheWriteTokens: models.reduce((n,m) => n + (m.usage.cacheWriteTokens ?? 0),0), reasoningTokens: models.reduce((n,m) => n + (m.usage.reasoningTokens ?? 0),0) };
    if (usage) snapshot(usage,models);
    return parseProviderEvent(kind, payload).flatMap(event => {
      const toolEvents: ChatEvent[] = event.type === 'done' ? [...calls.values()].map(call => ({type:'tool-call',call:{toolCallId:call.id,toolName:call.name,args:JSON.parse(call.text || '{}')}})) : [];
      if (event.type === 'done') calls.clear();
      if ((event.type === "done" || event.type === "error") && usage && !emitted) { emitted = true; return [...toolEvents, { type: "usage", usage }, event] as ChatEvent[]; }
      return [...toolEvents,event];
    });
  }
  let buffer = "";
  let data: string[] = [];
  function parseLine(line: string): ChatEvent[] {
    if (!sse) return line.trim() ? events(line) : [];
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
      if (data.reduce((size, part) => size + part.length, 0) > 2_000_000)
        throw new Error("Provider event too large");
    }
    if (line !== "" || data.length === 0) return [];
    const payload = data.join("\n");
    data = [];
    return events(payload);
  }
  for await (const chunk of chunks) {
    buffer += chunk;
    if (buffer.length > 2_000_000) throw new Error("Provider event too large");
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      for (const event of parseLine(line)) {
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
    }
  }
  for (const event of parseLine(buffer.replace(/\r$/, ""))) {
    yield event;
    if (event.type === "done" || event.type === "error") return;
  }
  if (sse) for (const event of parseLine("")) yield event;
}
