import { expect, it } from "vitest";
import { resolveModel } from "./model";
import type { Providers } from "./providers";
const list: Providers = [{ config: { id: "openai-api", kind: "api", enabled: true }, availability: { available: true }, models: [], modelsLoading: true }, { config: { id: "claude-cli", kind: "cli", enabled: true }, availability: { available: true }, models: [{ id: "default", name: "Default" }] }];
it("preserves the saved model until discovery settles, then falls back only when missing", () => {
  expect(resolveModel("openai-api/saved", list)).toBe("openai-api/saved");
  expect(resolveModel("openai-api/saved", [{ ...list[0]!, modelsLoading: false, models: [{ id: "saved", name: "Saved" }] }, list[1]!])).toBe("openai-api/saved");
  expect(resolveModel("openai-api/saved", [{ ...list[0]!, modelsLoading: false }, list[1]!])).toBe("claude-cli/default");
});
it("starts each CLI provider on its preferred model when it is available", () => {
  const cli = (id: string, models: string[]): Providers[number] => ({ config: { id, kind: "cli", enabled: true }, availability: { available: true }, models: models.map(m => ({ id: m, name: m })), modelsLoading: false }) as Providers[number];
  expect(resolveModel("", [cli("claude-cli", ["default", "sonnet"])])).toBe("claude-cli/sonnet");
  expect(resolveModel("", [cli("codex-cli", ["gpt-6.1-sol", "gpt-6-luna"])])).toBe("codex-cli/gpt-6-luna");
  expect(resolveModel("", [cli("agy-cli", ["gemini-3.8-flash-low", "gemini-3.8-flash-high"])])).toBe("agy-cli/gemini-3.8-flash-high");
});
