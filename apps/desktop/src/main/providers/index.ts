import { configuredCliPath } from './executable-pins';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  providerConfigSchema,
  type ChatEvent,
  type Usage,
  type ChatRequest,
  type ProviderConfig,
} from "../../shared/domain";
import type { SecretStore } from "../services/secrets";
import { createApiAdapter, validateBaseUrl } from "./api";
import { createCodexAdapter } from './codex';
import { createCliAdapter } from "./cli";
import { AgyAdapter } from "./agy";
export type Availability =
  | { available: true }
  | { available: false; reason: string };
export type Model = import("../../shared/domain").Model;
export type ProviderRequest = ChatRequest & { prompt: string; allowPresentation?: boolean; onUsageSnapshot?: (usage: Usage, models?: { modelId: string; usage: Usage }[]) => void };
export interface ProviderAdapter {
  detect(): Promise<Availability>;
  listModels(): Promise<Model[]>;
  stream(
    request: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ChatEvent>;
}
const fakeFailures = new Set<string>();
export const fakeAdapter: ProviderAdapter = {
  async detect() {
    return { available: true };
  },
  async listModels() {
    return [{ id: "fake", name: "Fake (test only)", options: [{ id: "effort", label: "Effort", values: [{ id: "low", label: "low" }, { id: "high", label: "high" }], default: "low" }] }, {id:'fixture-model',name:'Fixture model (test only)',options:[{id:'effort',label:'Effort',values:[{id:'low',label:'low'},{id:'high',label:'high'}],default:'low'},{id:'serviceTier',label:'Service tier',values:[{id:'default',label:'Default'},{id:'priority',label:'Priority'}],default:'default'}]}];
  },
  async *stream(request, signal) {
    if (request.userMessage === 'test error' && !fakeFailures.has(request.turnId ?? request.requestId)) { fakeFailures.add(request.turnId ?? request.requestId); yield { type: 'error', message: 'Provider rate limited' }; return; }
    const enriched = request.userMessage === 'test enriched';
    const citationId = request.prompt.match(/"id":"(s\d+)"/)?.[1];
    if (enriched) {
      yield {type:'reasoning-delta',text:'Reviewing the reported document sections.'};
      yield {type:'tool-call',call:{toolCallId:'present-fixture',toolName:'present',args:{title:'Document summary',columns:['Topic','Summary'],rows:[['Document','Grounded answer']]}}};
    }
    const fence = '`'.repeat(Math.max(2,...Array.from(request.prompt.matchAll(/`+/g),m => m[0].length)) + 1);
    const response = enriched ? `A grounded document summary.${citationId ? ` [[cite:${citationId}]]` : ''}` : `**bold**\n\n- First\n- Second\n\n${fence}text\n${request.prompt}\n${fence}`;
    for (let i = 0; i < response.length; i += 128) {
      signal.throwIfAborted();
      yield { type: "text-delta", text: response.slice(i, i + 128) };
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    signal.throwIfAborted();
    yield { type: "usage", usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 200, reasoningTokens: 40, costUsd: .012, costSource: "reported" } };
    yield { type: "done" };
  },
};
export class ProviderRegistry {
  private readonly adapters = new Map<ProviderConfig["id"], ProviderAdapter>();
  private modelRevision = 0;
  private modelCache = new Map<string, { models: Model[]; expires: number }>();
  private loading = new Set<string>();
  private availabilityCache = new Map<string, Availability>();
  private configs: ProviderConfig[] = [
    { kind: "api", id: "anthropic-api", enabled: true },
    { kind: "api", id: "openai-api", enabled: true },
    {
      kind: "compatible",
      id: "openai-compatible",
      enabled: false,
      baseUrl: "http://localhost:11434/v1",
    },
    { kind: "cli", id: "claude-cli", enabled: false },
    { kind: "cli", id: "codex-cli", enabled: false },
    { kind: "cli", id: "agy-cli", enabled: false },
  ];
  constructor(private readonly configFile?: string) {
    if (configFile && existsSync(configFile)) {
      try {
        for (const config of z
          .array(providerConfigSchema)
          .parse(JSON.parse(readFileSync(configFile, "utf8"))))
          this.replaceConfig(config);
      } catch {
        throw new Error("Provider configuration could not be loaded");
      }
    }
  }
  register(id: ProviderConfig["id"], adapter: ProviderAdapter): void {
    if (this.adapters.has(id)) throw new Error("Provider already registered");
    this.adapters.set(id, adapter);
  }
  get(id: ProviderConfig["id"]): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter || !this.config(id).enabled)
      throw new Error("Provider unavailable or disabled");
    return adapter;
  }
  config(id: ProviderConfig["id"]): ProviderConfig {
    const config = this.configs.find((config) => config.id === id);
    if (!config) throw new Error("Provider unavailable");
    return config;
  }
  private replaceConfig(config: ProviderConfig) {
    if (config.kind === "compatible") validateBaseUrl(config.baseUrl);
    this.configs = this.configs.map((current) =>
      current.id === config.id ? config : current,
    );
  }
  configure(input: ProviderConfig): void {
    const config = providerConfigSchema.parse(input);
    if (config.kind === "compatible") validateBaseUrl(config.baseUrl);
    const next = this.configs.map((current) =>
      current.id === config.id ? config : current,
    );
    if (this.configFile) {
      try {
        mkdirSync(dirname(this.configFile), { recursive: true });
        writeFileSync(`${this.configFile}.tmp`, JSON.stringify(next), {
          mode: 0o600,
        });
        renameSync(`${this.configFile}.tmp`, this.configFile);
      } catch {
        throw new Error("Provider configuration could not be saved");
      }
    }
    this.configs = next;
    this.modelRevision++;
    this.modelCache.clear();
  }
  private async models(config: ProviderConfig, adapter: ProviderAdapter, discover: boolean): Promise<Model[]> {
    const key = `${this.modelRevision}:${JSON.stringify(config)}`;
    const cached = this.modelCache.get(key);
    if (discover && (!cached || cached.expires < Date.now())) {
      const models = await adapter.listModels();
      this.modelCache.set(key, {models, expires: Date.now() + 60_000});
      return models;
    }
    return cached?.models ?? [];
  }
  async list(discover = true) {
    return Promise.all(
      this.configs.map(async (config) => {
        const adapter = this.adapters.get(config.id);
        try {
          const availability: Availability = !config.enabled
            ? { available: false, reason: "Provider disabled" }
            : adapter
              ? config.kind === 'cli' && !discover ? this.availabilityCache.get(config.id) ?? {available:false,reason:'Provider discovery required'} : await adapter.detect()
              : { available: false, reason: "Provider unavailable" };
          if (discover) this.availabilityCache.set(config.id, availability);
          return {
            config,
            ...(config.kind === 'cli' ? {resolvedPath:await configuredCliPath(config.id.replace('-cli',''))} : {}),
            availability,
            models: adapter && config.enabled ? await this.models(config, adapter, discover || config.kind !== 'cli') : [],
            modelsLoading: !!adapter && config.enabled && this.loading.has(`${this.modelRevision}:${JSON.stringify(config)}`),
          };
        } catch {
          return {
            config,
            availability: {
              available: false,
              reason: "Provider detection failed",
            } satisfies Availability,
            models: [],
            modelsLoading: false,
          };
        }
      }),
    );
  }
}
export function createProviderRegistry(
  secrets: SecretStore,
  configFile?: string,
): ProviderRegistry {
  const registry = new ProviderRegistry(configFile);
  const factories = {
    "anthropic-api": () =>
      process.env.VSTUDY_FAKE_PROVIDER === "1"
        ? fakeAdapter
        : createApiAdapter(() => registry.config("anthropic-api"), secrets),
    "openai-api": () =>
      createApiAdapter(() => registry.config("openai-api"), secrets),
    "openai-compatible": () =>
      createApiAdapter(() => registry.config("openai-compatible"), secrets),
    "claude-cli": () => createCliAdapter("claude"),
    "codex-cli": () => createCodexAdapter(configFile ? join(dirname(configFile), "codex-chat-proof.json") : undefined),
    "agy-cli": () => new AgyAdapter(),
  } satisfies Record<ProviderConfig["id"], () => ProviderAdapter>;
  for (const config of [
    "anthropic-api",
    "openai-api",
    "openai-compatible",
    "claude-cli",
    "codex-cli",
    "agy-cli",
  ] as const)
    registry.register(config, factories[config]());
  return registry;
}
