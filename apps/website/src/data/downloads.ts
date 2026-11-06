/** Installer inventory and browser recommendations. Unknown release metadata stays absent. */
export type InstallerId = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64';
export const downloadBase = 'https://github.com/ava-apple/vstudy-pro/releases/latest/download';
export const installers = [
  { id: 'mac-arm64', label: 'macOS · Apple silicon', file: 'VStudy-Pro-mac-arm64.dmg' },
  { id: 'mac-x64', label: 'macOS · Intel', file: 'VStudy-Pro-mac-x64.dmg' },
  { id: 'win-x64', label: 'Windows · x64', file: 'VStudy-Pro-win-x64.exe' },
  { id: 'win-arm64', label: 'Windows · ARM64', file: 'VStudy-Pro-win-arm64.exe' },
] as const satisfies readonly { id: InstallerId; label: string; file: string }[];

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
