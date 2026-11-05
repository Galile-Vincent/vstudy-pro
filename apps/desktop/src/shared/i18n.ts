/**
 * Load generated locale catalogs and provide shared translation and pseudo-locale helpers.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import { catalogs } from './locales.generated';

export type Language = 'en' | 'zh-Hant' | 'ja';
/** Map supported system locale variants and fall back to English. */
export function systemLanguage(locale: string): Language {
  if (/^zh[-_](TW|HK|Hant)(?:[-_]|$)/i.test(locale)) return 'zh-Hant';
  return /^ja(?:[-_]|$)/i.test(locale) ? 'ja' : 'en';
}
const accents: Record<string,string> = {a:'á',e:'ë',i:'ï',o:'ö',u:'ü',A:'Á',E:'Ë',I:'Ï',O:'Ö',U:'Ü'};
/** Expand English strings for layout checks while preserving interpolation placeholders. */
export function pseudo(text: string): string {
  return `［${text.split(/({{.*?}})/).map(part => part.startsWith('{{') ? part : part.replace(/[aeiouAEIOU]/g, c => accents[c]!)).join('')}${'～'.repeat(Math.ceil(text.length * .4))}］`;
}
/** Complete locale resources, including an expanded pseudo-locale for layout checks. */
export const resources = {
  ...catalogs,
  'en-XA': Object.fromEntries(Object.entries(catalogs.en).map(([namespace, catalog]) => [
    namespace,
    Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, pseudo(value)])),
  ])),
};
/** Initialize catalogs synchronously so native menus and first renderer paint use resolved labels. */
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({ resources, lng:'en', fallbackLng:'en', defaultNS:'common', keySeparator:false, interpolation:{escapeValue:false}, initImmediate:false });
/** Translate a namespace-qualified key through the initialized shared i18n instance. */
export function tr(key: string, params?: Record<string, unknown>): string { return String(i18n.t(key, params ?? {})); }
