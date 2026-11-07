/** Browser-side platform detection shared by the hero button and the download page. */
import { recommendedInstaller, type InstallerId, type PlatformHints } from '../data/downloads';

type HintedNavigator = Navigator & { userAgentData?: PlatformHints & {
  getHighEntropyValues?: (keys: string[]) => Promise<PlatformHints>;
} };

/** Calls back right away with what the user agent exposes, then again when richer hints resolve. */
export function detectInstaller(onResult: (id: InstallerId | undefined) => void) {
  const browser = navigator as HintedNavigator;
  onResult(recommendedInstaller(browser.userAgent, browser.userAgentData));
  try {
    browser.userAgentData?.getHighEntropyValues?.(['platform', 'architecture', 'bitness'])
      .then(hints => onResult(recommendedInstaller(browser.userAgent, hints))).catch(() => {});
  } catch {}
}
