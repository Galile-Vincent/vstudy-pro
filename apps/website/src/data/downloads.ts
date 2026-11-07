/** Installer inventory and browser recommendations. Unknown release metadata stays absent. */
import targets from '../../../desktop/distribution-targets.json' with {type: 'json'};
export type InstallerId = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64';
export const downloadBase = 'https://github.com/ava-apple/vstudy-pro/releases/latest/download';
export const installers = targets.map(target => ({
  id: target.key as InstallerId, label: target.label,
  platform: target.platform as 'mac' | 'win', arch: target.arch as 'arm64' | 'x64', kind: target.installer as 'dmg' | 'exe',
  file: `VStudy-Pro-${target.key}.${target.installer}`, releaseEnabled: target.releaseEnabled,
}));

/** Populate only from verified published assets, never the source package version. */
export const releaseMetadata: Partial<Record<InstallerId, { version: string; bytes: number }>> = {};

export interface PlatformHints {
  platform?: string;
  architecture?: string;
  bitness?: string;
}

/** Mac UA strings can say Intel on Apple silicon. Only high-entropy hints select Intel. */
export function recommendedInstaller(userAgent: string, hints: PlatformHints = {}): InstallerId | undefined {
  const platform = hints.platform || userAgent;
  if (/android|iphone|ipad|ipod/i.test(platform)) return undefined;
  if (/windows|win32|win64/i.test(platform)) {
    const arm64 = /^(arm64|aarch64)$/i.test(hints.architecture ?? '')
      || (/^arm$/i.test(hints.architecture ?? '') && hints.bitness === '64')
      || /\b(arm64|aarch64)\b/i.test(userAgent);
    return arm64 ? 'win-arm64' : 'win-x64';
  }
  if (/mac/i.test(platform)) {
    return /^(x86|x86_64|x64)$/i.test(hints.architecture ?? '') && hints.bitness === '64'
      ? 'mac-x64' : 'mac-arm64';
  }
  return undefined;
}
