import { z } from "zod";
import type { ChatEvent } from "../../shared/domain";
const wireEvent = z
  .object({
    type: z.string().optional(),
    is_error: z.boolean().optional(),
    delta: z
      .object({ type: z.string().optional(), text: z.string().optional() })
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
      return parseProviderEvent("anthropic", JSON.stringify(value.event));
    if (value.type === "result") return [{ type: "done" }];
  }
  if (kind === "anthropic") {
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
): AsyncIterable<ChatEvent> {
  let buffer = "";
  let data: string[] = [];
  function parseLine(line: string): ChatEvent[] {
    if (!sse) return line.trim() ? parseProviderEvent(kind, line) : [];
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
      if (data.reduce((size, part) => size + part.length, 0) > 2_000_000)
        throw new Error("Provider event too large");
    }
    if (line !== "" || data.length === 0) return [];
    const payload = data.join("\n");
    data = [];
    return parseProviderEvent(kind, payload);
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
        if (event.type !== "text-delta") return;
      }
    }
  }
  for (const event of parseLine(buffer.replace(/\r$/, ""))) {
    yield event;
    if (event.type !== "text-delta") return;
  }
  if (sse) for (const event of parseLine("")) yield event;
}
