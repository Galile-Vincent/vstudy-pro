import themesEn from './locales/en/themes.json';
import themesZh from './locales/zh-Hant/themes.json';
import themesJa from './locales/ja/themes.json';
import catalog2moodle from './locales/ja/moodle.json';
import catalog1moodle from './locales/zh-Hant/moodle.json';
import catalog0moodle from './locales/en/moodle.json';
import catalog2welcome from './locales/ja/welcome.json';
import catalog1welcome from './locales/zh-Hant/welcome.json';
import catalog0welcome from './locales/en/welcome.json';
import { initReactI18next } from "react-i18next";
import catalog0common from './locales/en/common.json';
import catalog0chat from './locales/en/chat.json';
import catalog0library from './locales/en/library.json';
import catalog0home from './locales/en/home.json';
import catalog0onboarding from './locales/en/onboarding.json';
import catalog0settings from './locales/en/settings.json';
import catalog0usage from './locales/en/usage.json';
import catalog0errors from './locales/en/errors.json';
import catalog0picker from './locales/en/picker.json';
import catalog1common from './locales/zh-Hant/common.json';
import catalog1chat from './locales/zh-Hant/chat.json';
import catalog1library from './locales/zh-Hant/library.json';
import catalog1home from './locales/zh-Hant/home.json';
import catalog1onboarding from './locales/zh-Hant/onboarding.json';
import catalog1settings from './locales/zh-Hant/settings.json';
import catalog1usage from './locales/zh-Hant/usage.json';
import catalog1errors from './locales/zh-Hant/errors.json';
import catalog1picker from './locales/zh-Hant/picker.json';
import catalog2common from './locales/ja/common.json';
import catalog2chat from './locales/ja/chat.json';
import catalog2library from './locales/ja/library.json';
import catalog2home from './locales/ja/home.json';
import catalog2onboarding from './locales/ja/onboarding.json';
import catalog2settings from './locales/ja/settings.json';
import catalog2usage from './locales/ja/usage.json';
import catalog2errors from './locales/ja/errors.json';
import catalog2picker from './locales/ja/picker.json';
import i18next from 'i18next';
export type Language = 'en' | 'zh-Hant' | 'ja';
export function systemLanguage(locale: string): Language {
  if (/^zh[-_](TW|HK|Hant)(?:[-_]|$)/i.test(locale)) return 'zh-Hant';
  return /^ja(?:[-_]|$)/i.test(locale) ? 'ja' : 'en';
}
const accents: Record<string,string> = {a:'á',e:'ë',i:'ï',o:'ö',u:'ü',A:'Á',E:'Ë',I:'Ï',O:'Ö',U:'Ü'};
export function pseudo(text: string): string {
  return `［${text.split(/({{.*?}})/).map(part => part.startsWith('{{') ? part : part.replace(/[aeiouAEIOU]/g, c => accents[c]!)).join('')}${'～'.repeat(Math.ceil(text.length * .4))}］`;
}
export const resources = {
'en': {themes:themesEn,common: catalog0common, chat: catalog0chat, library: catalog0library, home: catalog0home, onboarding: catalog0onboarding, settings: catalog0settings, usage: catalog0usage, errors: catalog0errors, picker: catalog0picker, welcome: catalog0welcome, moodle: catalog0moodle},
'zh-Hant': {themes:themesZh,common: catalog1common, chat: catalog1chat, library: catalog1library, home: catalog1home, onboarding: catalog1onboarding, settings: catalog1settings, usage: catalog1usage, errors: catalog1errors, picker: catalog1picker, welcome: catalog1welcome, moodle: catalog1moodle},
'ja': {themes:themesJa,common: catalog2common, chat: catalog2chat, library: catalog2library, home: catalog2home, onboarding: catalog2onboarding, settings: catalog2settings, usage: catalog2usage, errors: catalog2errors, picker: catalog2picker, welcome: catalog2welcome, moodle: catalog2moodle},
'en-XA': Object.fromEntries(Object.entries({themes:themesEn,common: catalog0common, chat: catalog0chat, library: catalog0library, home: catalog0home, onboarding: catalog0onboarding, settings: catalog0settings, usage: catalog0usage, errors: catalog0errors, picker: catalog0picker, welcome: catalog0welcome, moodle: catalog0moodle}).map(([ns,catalog]) => [ns,Object.fromEntries(Object.entries(catalog).map(([k,v]) => [k,pseudo(v)]))])),
};
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({ resources, lng:'en', fallbackLng:'en', defaultNS:'common', keySeparator:false, interpolation:{escapeValue:false}, initImmediate:false });
export function tr(key: string, params?: Record<string, unknown>): string { return String(i18n.t(key, params ?? {})); }
