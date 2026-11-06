/** Renderer-only entry point. The app host owns the single guided setup dialog. */
import type { CliProvider } from '../../shared/ai-cli';

export const aiCliSetupEvent = 'vstudy:ai-cli-setup';
/** Open guided setup without coupling a caller to its UI or action lifecycle. */
export function openAiCliSetup(provider?: CliProvider) {
  window.dispatchEvent(new CustomEvent(aiCliSetupEvent, { detail: { provider } }));
}
export function aiCliChanged() {
  window.dispatchEvent(new Event('vstudy:ai-cli-changed'));
  window.dispatchEvent(new Event('vstudy:providers-changed'));
}
