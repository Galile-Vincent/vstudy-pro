import type { Providers } from "./providers";
/** Model a provider starts with when the user has not chosen one. */
export const preferredModels: Record<string, string> = { "claude-cli": "sonnet", "codex-cli": "gpt-6-luna", "agy-cli": "gemini-3.8-flash-high" };
export function resolveModel(current: string, providers: Providers): string {
  const slash = current.indexOf("/");
  const saved = providers.find(p => p.config.id === current.slice(0, slash));
  if (saved && (saved.modelsLoading || saved.models.some(m => m.id === current.slice(slash + 1)))) return current;
  const first = providers.find(p => p.config.enabled && p.availability.available && p.models.length);
  if (!first) return "";
  const preferred = preferredModels[first.config.id];
  return `${first.config.id}/${first.models.some(m => m.id === preferred) ? preferred : first.models[0]!.id}`;
}
