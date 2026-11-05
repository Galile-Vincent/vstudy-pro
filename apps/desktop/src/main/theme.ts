/**
 * Synchronize saved appearance with native Electron window colors and materials.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { BrowserWindow, nativeTheme } from 'electron';
import { type Settings } from '../shared/domain';
import { resolveTheme } from '../shared/themes';

/** Resolve the saved theme and scheme to the native window background. */
export function nativeBackground(settings: Settings): string {
  const scheme = settings.colorScheme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.colorScheme;
  return resolveTheme(settings)[scheme].background;
}

/** Apply saved appearance to Electron without bypassing solid-material preferences. */
export function applyNativeTheme(settings: Settings): void {
  if (nativeTheme.themeSource !== settings.colorScheme) nativeTheme.themeSource = settings.colorScheme;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(nativeBackground(settings));
    window.setVibrancy(settings.material === 'glass' && settings.glassOpacity < 100 && !nativeTheme.prefersReducedTransparency ? 'under-window' : null);
  }
}
