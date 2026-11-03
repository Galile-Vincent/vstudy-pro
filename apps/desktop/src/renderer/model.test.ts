import { expect, it } from "vitest";
import { resolveModel } from "./model";
import type { Providers } from "./providers";
const list: Providers = [{ config: { id: "openai-api", kind: "api", enabled: true }, availability: { available: true }, models: [], modelsLoading: true }, { config: { id: "claude-cli", kind: "cli", enabled: true }, availability: { available: true }, models: [{ id: "default", name: "Default" }] }];
it("preserves the saved model until discovery settles, then falls back only when missing", () => {
  expect(resolveModel("openai-api/saved", list)).toBe("openai-api/saved");
  expect(resolveModel("openai-api/saved", [{ ...list[0]!, modelsLoading: false, models: [{ id: "saved", name: "Saved" }] }, list[1]!])).toBe("openai-api/saved");
  expect(resolveModel("openai-api/saved", [{ ...list[0]!, modelsLoading: false }, list[1]!])).toBe("claude-cli/default");
});
