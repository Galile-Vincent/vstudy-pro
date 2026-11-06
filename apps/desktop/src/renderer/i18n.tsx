import { track } from './analytics';
import { formatters } from "../shared/format";
import { useTranslation } from 'react-i18next';
import { i18n, systemLanguage } from '../shared/i18n';
import { desktop } from './bridge';
import type { Settings } from '../shared';
export async function applyLanguage(language: Settings['language']): Promise<void> {
  const locale = language === 'auto' ? systemLanguage(await desktop.invoke('settings:systemLocale',{})) : language;
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event('language-changed'));
}
export function useFormat() {
  const { i18n: instance } = useTranslation();
  return formatters(instance.language);
}
export async function saveLanguage(field: 'language' | 'replyLanguage', value: Settings['language']) {
  const latest = await desktop.invoke('settings:get',{});
  const saved = await desktop.invoke('settings:set',{...latest,[field]:value});
  if(field === 'language') { await applyLanguage(saved.language); if (latest.language !== saved.language) track('language_changed', {app_language:document.documentElement.lang}); }
  return saved;
}
