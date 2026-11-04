import { tr } from "../shared/i18n";
import type { IpcResponse, ProviderConfig } from "../shared";
export type Providers = IpcResponse<"providers:list">;
export const providerName: Record<ProviderConfig["id"], string> = {
  "openai-api": "OpenAI",
  "anthropic-api": "Anthropic",
  get "openai-compatible"() { return tr('common:openai_compatible'); },
  "codex-cli": "Codex CLI",
  "claude-cli": "Claude CLI",
  "agy-cli": "Antigravity CLI",
};
