import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  providerConfigSchema,
  type ChatEvent,
  type ChatRequest,
  type ProviderConfig,
} from "../../shared/domain";
import type { SecretStore } from "../services/secrets";
import { createApiAdapter, validateBaseUrl } from "./api";
import { createCliAdapter } from "./cli";
export type Availability =
  | { available: true }
  | { available: false; reason: string };
export interface Model {
  id: string;
  name: string;
}
export type ProviderRequest = ChatRequest & { prompt: string };
export interface ProviderAdapter {
  detect(): Promise<Availability>;
  listModels(): Promise<Model[]>;
  stream(
    request: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ChatEvent>;
}
export const fakeAdapter: ProviderAdapter = {
  async detect() {
    return { available: true };
  },
  async listModels() {
    return [{ id: "fake", name: "Fake (test only)" }];
  },
  async *stream(request, signal) {
    for (let i = 0; i < request.prompt.length; i += 128) {
      signal.throwIfAborted();
      yield { type: "text-delta", text: request.prompt.slice(i, i + 128) };
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    yield { type: "done" };
  },
};
export class ProviderRegistry {
  private readonly adapters = new Map<ProviderConfig["id"], ProviderAdapter>();
  private modelRevision = 0;
  private modelCache = new Map<string, { models: Model[]; expires: number }>();
  private loading = new Set<string>();
  private configs: ProviderConfig[] = [
    { kind: "api", id: "anthropic-api", enabled: true },
    { kind: "api", id: "openai-api", enabled: true },
    {
      kind: "compatible",
      id: "openai-compatible",
      enabled: false,
      baseUrl: "http://localhost:11434/v1",
    },
    { kind: "cli", id: "claude-cli", enabled: true },
    { kind: "cli", id: "codex-cli", enabled: true },
    { kind: "cli", id: "agy-cli", enabled: true },
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
  private models(config: ProviderConfig, adapter: ProviderAdapter): Model[] {
    const key = `${this.modelRevision}:${JSON.stringify(config)}`;
    const cached = this.modelCache.get(key);
    if ((!cached || cached.expires < Date.now()) && !this.loading.has(key)) {
      this.loading.add(key);
      void adapter.listModels().then(models => { this.modelCache.set(key, { models, expires: Date.now() + 60_000 }); }).catch(() => {}).finally(() => this.loading.delete(key));
    }
    return cached?.models ?? [];
  }
  async list() {
    return Promise.all(
      this.configs.map(async (config) => {
        const adapter = this.adapters.get(config.id);
        try {
          const availability: Availability = !config.enabled
            ? { available: false, reason: "Provider disabled" }
            : adapter
              ? await adapter.detect()
              : { available: false, reason: "Provider unavailable" };
          return {
            config,
            availability,
            models: adapter && config.enabled ? this.models(config, adapter) : [],
          };
        } catch {
          return {
            config,
            availability: {
              available: false,
              reason: "Provider detection failed",
            } satisfies Availability,
            models: [],
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
    "codex-cli": () => createCliAdapter("codex"),
    "agy-cli": () => createCliAdapter("agy"),
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
