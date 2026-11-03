import type { Providers } from "./providers";
export function resolveModel(current: string, providers: Providers): string {
  const slash = current.indexOf("/");
  const saved = providers.find(p => p.config.id === current.slice(0, slash));
  if (saved && (saved.modelsLoading || saved.models.some(m => m.id === current.slice(slash + 1)))) return current;
  const first = providers.find(p => p.config.enabled && p.availability.available && p.models.length);
  return first ? `${first.config.id}/${first.models[0]!.id}` : "";
}
