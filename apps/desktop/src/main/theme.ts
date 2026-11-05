/** Keeps the native window and macOS appearance aligned with persisted theme settings. */
import { BrowserWindow, nativeTheme } from 'electron';
import { type Settings } from '../shared/domain';
import { resolveTheme } from '../shared/themes';

export function nativeBackground(settings: Settings): string {
  const scheme = settings.colorScheme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.colorScheme;
  return resolveTheme(settings)[scheme].background;
}

export function applyNativeTheme(settings: Settings): void {
  if (nativeTheme.themeSource !== settings.colorScheme) nativeTheme.themeSource = settings.colorScheme;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(nativeBackground(settings));
    window.setVibrancy(settings.material === 'glass' && settings.glassOpacity < 100 && !nativeTheme.prefersReducedTransparency ? 'under-window' : null);
  }
}
