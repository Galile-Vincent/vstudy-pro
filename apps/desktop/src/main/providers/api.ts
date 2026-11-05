/**
 * Adapt HTTP streaming providers and classify public transport failures.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { recordEgress } from '../services/egress';
import { option } from "./model-options";
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
/** Expose stable transport failures without raw provider response data. */
export class ProviderError extends Error {
  constructor(readonly category: keyof typeof errorMessages, message = errorMessages[category]) { super(message); }
}
/** Map HTTP status to a stable provider error without exposing response bodies. */
export function httpError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth failed');
  if ([429, 529].includes(status)) return new ProviderError('rate limited');
  if (status === 408) return new ProviderError('network', 'Provider request timed out (HTTP 408). Try again.');
  if ([409, 425].includes(status)) return new ProviderError('server error', `Provider temporarily unavailable (HTTP ${status}). Try again.`);
  if (status >= 500) return new ProviderError('server error', `Provider server error (HTTP ${status}). Try again.`);
  return new ProviderError('bad request');
}
/** Recognize the explicit loopback exception supported by local compatible providers. */
export function isLoopback(value: string): boolean { return ["localhost", "[::1]"].includes(new URL(value).hostname) || /^127\.\d+\.\d+\.\d+$/.test(new URL(value).hostname); }
/** Validate configured provider endpoints before sending credentials or prompts. */
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
/** Decode streamed UTF-8 chunks and release the reader on completion or cancellation. */
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
/** Create an HTTP provider adapter with validated events and abortable streaming. */
export function createApiAdapter(
  getConfig: () => ProviderConfig,
  secrets: { getInMainOnly: (id: ProviderConfig["id"]) => string | null | Promise<string | null>; has?: SecretStore["has"]; isUnlocked?: SecretStore["isUnlocked"] },
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
    async testConnection() {
      const token = await key();
      if (!token && !noKeyRequired()) return 'bad_key';
      try {
        recordEgress('provider_request', new URL(base()).origin);
        const response = await fetcher(`${base()}/models${anthropic() ? '?limit=1' : ''}`, {
          headers: anthropic() ? { 'x-api-key': token ?? '', 'anthropic-version': '2023-06-01' } : token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        });
        await response.body?.cancel();
        if (response.ok) return 'success';
        return response.status === 401 ? 'bad_key' : 'no_access';
      } catch {
        return 'offline';
      }
    },
    async detect() {
      return secrets.isUnlocked?.(getConfig().id) || (secrets.has ? secrets.has(getConfig().id) : await key()) || noKeyRequired()
        ? { available: true }
        : { available: false, reason: "Add an API key" };
    },
    async listModels() {
      if (secrets.isUnlocked && !secrets.isUnlocked(getConfig().id) && !noKeyRequired()) return [];
      if (anthropic())
        return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"].map(
          (id) => ({ id, name: id, supportsImages:true }),
        );
      const token = await key();
      if (!token && !noKeyRequired()) return [];
      try {
        recordEgress('provider_request', new URL(base()).origin);
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
          .map(({ id }) => ({ id, name: id, supportsImages:(()=>{const config=getConfig();return config.kind==='compatible'?config.imageModelIds?.includes(id)===true:config.id==='openai-api' && /^(gpt-[456]|o[134])/.test(id);})(), ...(getConfig().id === 'openai-api' && /^(o1|o3|o3-mini|o4-mini)(-\d{4}-\d{2}-\d{2})?$/.test(id) ? { options: [option('reasoning_effort', 'Effort', ['low', 'medium', 'high'], 'medium')] } : {}) }));
      } catch {
        return [];
      }
    },
    async *stream(request, signal) {
      const token = await key();
      if (!token && !noKeyRequired()) throw new ProviderError("auth failed");
      const isAnthropic = anthropic();
      recordEgress('provider_request', new URL(base()).origin);
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
            ...(request.systemPrompt && isAnthropic ? {system:request.systemPrompt} : {}),
            messages: [...(request.systemPrompt && !isAnthropic ? [{role:'system',content:request.systemPrompt}] : []), { role: "user", content: request.images?.length ? [
              ...(isAnthropic ? [{type:'text',text:request.prompt}] : [{type:'text',text:request.prompt}]),
              ...request.images.map(image => isAnthropic ? {type:'image',source:{type:'base64',media_type:image.mediaType,data:image.data}} : {type:'image_url',image_url:{url:`data:${image.mediaType};base64,${image.data}`}}),
            ] : request.prompt }],
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
