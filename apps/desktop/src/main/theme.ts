/**
 * Synchronize saved appearance with native Electron window colors and materials.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { BrowserWindow, nativeTheme, systemPreferences } from 'electron';
import { type Settings } from '../shared/domain';
import { resolveTheme } from '../shared/themes';

/** Resolve the saved theme and scheme to the native window background. */
export function nativeBackground(settings: Settings): string {
  const scheme = settings.colorScheme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.colorScheme;
  return resolveTheme(settings)[scheme].background;
}

type WindowAppearance = { color: string; target: string; timer?: ReturnType<typeof setTimeout> };
const appearances = new WeakMap<BrowserWindow, WindowAppearance>();

function updateBackground(window: BrowserWindow, color: string): void {
  const previous = appearances.get(window);
  if (previous?.target === color) return;
  clearTimeout(previous?.timer);
  const state: WindowAppearance = {color:previous?.color ?? color, target:color};
  appearances.set(window, state);
  if (!previous || !window.isVisible() || systemPreferences.getAnimationSettings().prefersReducedMotion) {
    state.color = color;
    window.setBackgroundColor(color);
    return;
  }
  const start = performance.now();
  const from = [1,3,5].map(offset => parseInt(state.color.slice(offset, offset + 2), 16));
  const to = [1,3,5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const tick = () => {
    if (window.isDestroyed()) return;
    const elapsed = Math.min(1, (performance.now() - start) / 280);
    const progress = 1 - (1 - elapsed) ** 3;
    state.color = '#' + from.map((value, index) => Math.round(value + (to[index]! - value) * progress).toString(16).padStart(2, '0')).join('');
    window.setBackgroundColor(state.color);
    if (elapsed < 1) { state.timer = setTimeout(tick, 16); state.timer.unref(); }
  };
  tick();
}

/** Apply saved appearance to Electron without bypassing solid-material preferences. */
export function applyNativeTheme(settings: Settings): void {
  if (nativeTheme.themeSource !== settings.colorScheme) nativeTheme.themeSource = settings.colorScheme;
  for (const window of BrowserWindow.getAllWindows()) {
    updateBackground(window, nativeBackground(settings));
  }
}
