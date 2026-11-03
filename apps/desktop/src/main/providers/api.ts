import { z } from "zod";
import type { ProviderConfig } from "../../shared/domain";
import type { SecretStore } from "../services/secrets";
import type { ProviderAdapter } from "./index";
import { parseStream } from "./parsers";
export function validateBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error(
      "Provider URL must use HTTPS or localhost HTTP without credentials, query, or fragment",
    );
  return url.href.replace(/\/$/, "");
}
export async function* responseText(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    yield decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function createApiAdapter(
  getConfig: () => ProviderConfig,
  secrets: Pick<SecretStore, "getInMainOnly">,
  fetcher: typeof fetch = fetch,
): ProviderAdapter {
  const anthropic = () => getConfig().id === "anthropic-api";
  const base = () => {
    const config = getConfig();
    return config.kind === "compatible"
      ? validateBaseUrl(config.baseUrl)
      : anthropic()
        ? "https://api.anthropic.com/v1"
        : "https://api.openai.com/v1";
  };
  const key = () => secrets.getInMainOnly(getConfig().id);
  return {
    async detect() {
      return key()
        ? { available: true }
        : { available: false, reason: "Add an API key" };
    },
    async listModels() {
      if (anthropic())
        return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"].map(
          (id) => ({ id, name: id }),
        );
      const token = key();
      if (!token) return [];
      try {
        const response = await fetcher(`${base()}/models`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        if (!response.ok) return [];
        return z
          .object({ data: z.array(z.object({ id: z.string() })) })
          .parse(await response.json())
          .data.slice(0, 500)
          .map(({ id }) => ({ id, name: id }));
      } catch {
        return [];
      }
    },
    async *stream(request, signal) {
      const token = key();
      if (!token) throw new Error("API key unavailable");
      const isAnthropic = anthropic();
      const response = await fetcher(
        `${base()}/${isAnthropic ? "messages" : "chat/completions"}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
          headers: isAnthropic
            ? {
                "content-type": "application/json",
                "x-api-key": token,
                "anthropic-version": "2023-06-01",
              }
            : {
                "content-type": "application/json",
                Authorization: `Bearer ${token}`,
              },
          body: JSON.stringify({
            model: request.modelId,
            stream: true,
            ...(isAnthropic ? { max_tokens: 8192 } : {}),
            messages: [{ role: "user", content: request.prompt }],
          }),
        },
      );
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Provider HTTP request failed");
      }
      let terminal = false;
      for await (const event of parseStream(
        responseText(response.body),
        isAnthropic ? "anthropic" : "openai",
        true,
      )) {
        signal.throwIfAborted();
        if (event.type !== "text-delta") terminal = true;
        yield event;
      }
      if (!terminal) throw new Error("Provider stream ended unexpectedly");
    },
  };
}
