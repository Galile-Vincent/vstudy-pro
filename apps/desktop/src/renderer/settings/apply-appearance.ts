/** Applies validated settings before React mounts and follows system scheme changes. */
import { type Settings } from '../../shared/domain';
import { adjustedTokens, resolveTheme, themePreferencesSchema, type ThemePreferences, type ThemePack } from '../../shared/themes';
import { desktop } from '../bridge';

const cacheKey = 'vstudy-appearance-v1';
let current: ThemePreferences = themePreferencesSchema.parse({});

export function applyTheme(preferences: ThemePreferences, preview?: ThemePack): void {
  current = preferences;
  const scheme = preferences.colorScheme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preferences.colorScheme;
  const root = document.documentElement;
  const theme = preview ?? resolveTheme(preferences);
  for (const [name, value] of Object.entries(adjustedTokens(theme[scheme], scheme, preferences.contrast))) {
    root.style.setProperty(`--${name === "sidebar" ? "sidebar-surface" : name}`, value);
  }
  root.style.setProperty('--glass-opacity', `${preferences.glassOpacity}%`);
  root.dataset.theme = theme.id;
  root.dataset.scheme = scheme;
  root.classList.toggle('dark', scheme === 'dark');
  root.style.colorScheme = scheme;
}

/** The cache avoids a default-theme paint while the authoritative SQLite settings load. */
export function applyAppearance(settings: Settings): void {
  applyTheme(settings);
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(settings.uiScale / 100));
  root.style.setProperty('--density', settings.density === 'compact' ? '.875' : '1');
  root.style.setProperty('--font-reader', settings.readerFont === 'serif'
    ? 'Georgia,"Noto Serif CJK TC",serif' : settings.readerFont === 'mono' ? 'var(--font-mono)' : 'var(--font-ui)');
  root.style.setProperty('--reader-size', {s:'.8125rem',m:'.875rem',l:'1rem',xl:'1.125rem'}[settings.readerSize]);
  root.dataset.material = settings.material;
  try { localStorage.setItem(cacheKey, JSON.stringify(settings)); } catch { /* SQLite remains authoritative if renderer storage is unavailable. */ }
}

export async function initializeAppearance(): Promise<void> {
  try {
    const cached = themePreferencesSchema.parse(JSON.parse(localStorage.getItem(cacheKey) ?? '{}'));
    applyTheme(cached);
  } catch { applyTheme(current); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current.colorScheme === 'system') applyTheme(current);
  });
  try { applyAppearance(await desktop.invoke('settings:get', {})); }
  catch { /* The validated cache keeps the app usable if settings cannot be loaded. */ }
  document.documentElement.dataset.appearanceReady = "true";
}
