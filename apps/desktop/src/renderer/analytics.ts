import { desktop } from './bridge';
// Only renderer-owned events accepted by analytics-core. No free-form properties.
type Events = {
  screen_viewed: { screen_name: 'library' | 'document' | 'chat' | 'planner' | 'moodle' | 'settings' };
  settings_opened: { settings_section: 'general' | 'privacy' | 'ai' | 'moodle' | 'storage' | 'appearance' | 'usage' };
  theme_changed: { theme: 'light' | 'dark' | 'system' };
  language_changed: { app_language: string };
  onboarding_started: { onboarding_version: number };
  onboarding_skipped: { onboarding_version: number };
};
export function track<E extends keyof Events>(event: E, properties: Events[E]) {
  void desktop.invoke('analytics:track', { event, properties }).catch(() => {});
}
