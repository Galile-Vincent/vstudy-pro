import { expect, it } from "vitest";
import { parseProviderEvent, parseStream } from "./parsers";
async function* split(text: string) {
  for (let i = 0; i < text.length; i += 3) yield text.slice(i, i + 3);
}
it("parses fragmented CRLF Anthropic SSE and ignores ping frames", async () => {
  const fixture =
    'event: ping\r\ndata: {"type":"ping"}\r\n\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\r\n\r\ndata: {"type":"message_stop"}\r\n\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"late"}}\n\n';
  expect(await collect(parseStream(split(fixture), "anthropic", true))).toEqual(
    [{ type: "text-delta", text: "hello" }, { type: "done" }],
  );
});
it("parses OpenAI SSE including usage-only chunks and DONE", async () => {
  expect(
    await collect(
      parseStream(
        split(
          'data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: {"choices":[]}\n\ndata: [DONE]\n\n',
        ),
        "openai",
        true,
      ),
    ),
  ).toEqual([{ type: "text-delta", text: "answer" }, { type: "done" }]);
});
it("parses Claude partials without duplicating the final assistant message", async () => {
  const fixture = [
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hi" },
      },
    },
    { type: "assistant", message: { content: [{ type: "text", text: "Hi" }] } },
    { type: "result", is_error: false },
  ]
    .map((v) => JSON.stringify(v))
    .join("\n");
  expect(await collect(parseStream(split(fixture), "claude"))).toEqual([
    { type: "text-delta", text: "Hi" },
    { type: "done" },
  ]);
});
it("parses Codex completed agent items and terminal failures with sanitized errors", async () => {
  const fixture = [
    { type: "thread.started" },
    { type: "item.started", item: { type: "agent_message", text: "" } },
    {
      type: "item.completed",
      item: { type: "agent_message", text: "Codex answer" },
    },
    { type: "turn.completed" },
  ]
    .map((v) => JSON.stringify(v))
    .join("\n");
  expect(await collect(parseStream(split(fixture), "codex"))).toEqual([
    { type: "text-delta", text: "Codex answer" },
    { type: "done" },
  ]);
  expect(
    parseProviderEvent(
      "codex",
      '{"type":"turn.failed","error":{"message":"secret document"}}',
    ),
  ).toEqual([{ type: "error", message: "Provider request failed" }]);
  expect(
    parseProviderEvent(
      "claude",
      '{"type":"result","is_error":true,"result":"secret"}',
    ),
  ).toEqual([{ type: "error", message: "Provider request failed" }]);
});
it("rejects malformed JSON and oversized frames", async () => {
  await expect(
    collect(parseStream(split("{bad}\n"), "codex")),
  ).rejects.toThrow();
  async function* huge() {
    yield "a".repeat(2_000_001);
  }
  await expect(collect(parseStream(huge(), "codex"))).rejects.toThrow(
    "too large",
  );
});

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of source) result.push(value);
  return result;
}
it("waits for Claude's delayed result after message_stop and honors is_error", async () => {
  async function* fixture() {
    yield '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}}\n';
    yield '{"type":"stream_event","event":{"type":"message_stop"}}\n';
    await new Promise(resolve => setTimeout(resolve, 10));
    yield '{"type":"result","is_error":true}\n';
  }
  const events = [];
  for await (const event of parseStream(fixture(), "claude")) events.push(event);
  expect(events).toEqual([{ type: "text-delta", text: "answer" }, { type: "error", message: "Provider request failed" }]);
});
