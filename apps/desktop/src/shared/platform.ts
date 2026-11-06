/** Platform capabilities and shortcut labels shared by native and sandboxed UI code. */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'unknown';

/** Electron's user agent identifies the host without granting renderer Node access. */
export function desktopPlatform(): DesktopPlatform {
  if (typeof navigator !== 'undefined') {
    const identity = `${navigator.platform} ${navigator.userAgent}`;
    if (/Mac|Darwin/i.test(identity)) return 'darwin';
    if (/\bWin(?:32|64|dows)\b/i.test(identity)) return 'win32';
    if (/Linux/i.test(identity)) return 'linux';
  }
  if (typeof process !== 'undefined' && ['darwin', 'win32', 'linux'].includes(process.platform)) {
    if (process.platform === 'darwin') return 'darwin';
    if (process.platform === 'win32') return 'win32';
    return 'linux';
  }
  return 'unknown';
}

/** Use the same modifier label in tooltips, walkthroughs, and shortcut reference copy. */
export function shortcutModifier(platform = desktopPlatform()): 'Cmd' | 'Ctrl' {
  return platform === 'darwin' ? 'Cmd' : 'Ctrl';
}

/** Codex chat is audited only with macOS kernel process isolation. */
export function supportsIsolatedCodex(platform: string): boolean { return platform === 'darwin'; }

const windowsMessages: Readonly<Record<string, string>> = {
  'settings:waiting': 'storage_waiting',
  'settings:keychain_help': 'storage_help',
  'settings:keychain_failed': 'storage_failed',
  'errors:keychain_unavailable': 'storage_failed',
  'moodle:keychain_waiting': 'storage_waiting',
  'moodle:keychain_hint': 'school_storage_help',
  'onboarding:ai_keychain_body': 'storage_help',
  'onboarding:before_school': 'before_school',
  'settings:converter_copy': 'converter_copy',
};

/** Preserve Mac copy and use explicit Windows credential and converter wording. */
export function platformTranslationKey(key: string, platform = desktopPlatform()): string {
  const replacement = platform === 'win32' ? windowsMessages[key] : undefined;
  return replacement ? `distribution:${replacement}` : key;
}
