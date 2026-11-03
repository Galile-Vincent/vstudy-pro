import { recordEgress } from '../services/egress';
import { option } from "./models";
import { z } from "zod";
import { headerRateLimit } from "./usage";
import type { Usage, ProviderConfig } from "../../shared/domain";
import type { SecretStore } from "../services/secrets";
import type { ProviderAdapter } from "./index";
import { parseStream } from "./parsers";
import { presentationTool } from "../../shared/presentation";
const errorMessages = {
  'auth failed': 'Authentication failed. Check the API key in Settings.',
  'rate limited': 'Provider rate limited. Try again shortly.',
  network: 'Network error. Check your connection and try again.',
  'bad request': 'Provider rejected the request. Check the model and settings.',
  'provider unavailable': 'Provider unavailable. Check provider configuration and try again.',
  'server error': 'Provider server error. Try again.',
  budget: 'Provider budget exceeded. Check your quota or billing.',
};
export class ProviderError extends Error {
  constructor(readonly category: keyof typeof errorMessages, message = errorMessages[category]) { super(message); }
}
export function httpError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth failed');
  if ([429, 529].includes(status)) return new ProviderError('rate limited');
  if (status === 408) return new ProviderError('network', 'Provider request timed out (HTTP 408). Try again.');
  if ([409, 425].includes(status)) return new ProviderError('server error', `Provider temporarily unavailable (HTTP ${status}). Try again.`);
  if (status >= 500) return new ProviderError('server error', `Provider server error (HTTP ${status}). Try again.`);
  return new ProviderError('bad request');
}
export function isLoopback(value: string): boolean { return ["localhost", "[::1]"].includes(new URL(value).hostname) || /^127\.\d+\.\d+\.\d+$/.test(new URL(value).hostname); }
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
        isLoopback(value))
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
  const noKeyRequired = () => getConfig().kind === "compatible" && isLoopback(base());
  return {
    async detect() {
      return key() || noKeyRequired()
        ? { available: true }
        : { available: false, reason: "Add an API key" };
    },
    async listModels() {
      if (anthropic())
        return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"].map(
          (id) => ({ id, name: id }),
        );
      const token = key();
      if (!token && !noKeyRequired()) return [];
      try {
        recordEgress('Provider request', new URL(base()).origin);
      const response = await fetcher(`${base()}/models`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(2500),
          redirect: "error",
        });
        if (!response.ok) return [];
        return z
          .object({ data: z.array(z.object({ id: z.string() })) })
          .parse(await response.json())
          .data.slice(0, 500)
          .map(({ id }) => ({ id, name: id, ...(getConfig().id === 'openai-api' && /^(o1|o3|o3-mini|o4-mini)(-\d{4}-\d{2}-\d{2})?$/.test(id) ? { options: [option('reasoning_effort', 'Effort', ['low', 'medium', 'high'], 'medium')] } : {}) }));
      } catch {
        return [];
      }
    },
    async *stream(request, signal) {
      const token = key();
      if (!token && !noKeyRequired()) throw new ProviderError("auth failed");
      const isAnthropic = anthropic();
      recordEgress('Provider request', new URL(base()).origin);
      const response = await fetcher(
        `${base()}/${isAnthropic ? "messages" : "chat/completions"}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
          headers: isAnthropic
            ? {
                "content-type": "application/json",
                "x-api-key": token ?? "",
                "anthropic-version": "2023-06-01",
              }
            : {
                "content-type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
          body: JSON.stringify({
            model: request.modelId,
            stream: true,
            ...(request.allowPresentation && ['anthropic-api','openai-api'].includes(getConfig().id) ? { tools: isAnthropic
              ? [{ name:presentationTool.name,description:presentationTool.description,input_schema:presentationTool.parameters }]
              : [{ type:'function',function:presentationTool }], ...(!isAnthropic ? {parallel_tool_calls:false} : {}) } : {}),
            ...(request.options?.reasoning_effort ? { reasoning_effort: request.options.reasoning_effort } : {}),
            ...(isAnthropic ? { max_tokens: 8192 } : { stream_options: { include_usage: true } }),
            messages: [{ role: "user", content: request.prompt }],
          }),
        },
      ).catch(() => { throw new ProviderError("network"); });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw httpError(response.status);
      }
      let terminal = false;
      let usage: Usage | undefined;
      let text = '';
      const rateLimit = headerRateLimit(response.headers, isAnthropic);
      const snapshot = (value: Usage) => { usage = { ...value, ...(rateLimit ? { rateLimit } : {}) }; request.onUsageSnapshot?.(usage); };
      const inputChars = request.prompt.length + (request.allowPresentation ? JSON.stringify(presentationTool).length : 0);
      const finalUsage = (): Usage => usage ?? { inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(text.length / 4), costSource: 'estimated', ...(rateLimit ? { rateLimit } : {}) };
      for await (const event of parseStream(
        responseText(response.body),
        isAnthropic ? "anthropic" : "openai",
        true, snapshot,
      )) {
        signal.throwIfAborted();
        if (event.type === 'usage') { snapshot(event.usage); continue; }
        if (event.type === 'text-delta') { text += event.text; if (!usage) request.onUsageSnapshot?.(finalUsage()); }
        if (event.type === 'reasoning-delta' || event.type === 'tool-call') {
          text += event.type === 'reasoning-delta' ? event.text : JSON.stringify(event.call.args);
          if (!usage) request.onUsageSnapshot?.(finalUsage());
        }
        if (event.type === 'done' || event.type === 'error') { terminal = true; yield { type: 'usage', usage: finalUsage() }; }
        yield event;
      }
      if (!terminal) throw new Error("Provider stream ended unexpectedly");
    },
  };
}
