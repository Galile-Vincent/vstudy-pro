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
  const locale = instance.language === 'en-XA' ? 'en' : instance.language;
  return {
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
    currency: (value: number) => new Intl.NumberFormat(locale,{style:'currency',currency:'USD',maximumFractionDigits:3}).format(value),
    date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale,options).format(new Date(value)),
    relative: (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(value,unit),
  };
}
export async function saveLanguage(field: 'language' | 'replyLanguage', value: Settings['language']) {
  const latest = await desktop.invoke('settings:get',{});
  const saved = await desktop.invoke('settings:set',{...latest,[field]:value});
  if(field === 'language') await applyLanguage(saved.language);
  return saved;
}
