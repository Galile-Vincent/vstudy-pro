/** Renderer-owned guidance for the merged global History workflow. */
import { i18n, pseudo } from '../../shared/i18n';
import en from './locales/en.json';
import zh from './locales/zh-Hant.json';
import ja from './locales/ja.json';

for (const [language, messages] of Object.entries({ en, 'zh-Hant': zh, ja, 'en-XA': Object.fromEntries(Object.entries(en).map(([key, value]) => [key, pseudo(value)])) })) {
  i18n.addResourceBundle(language, 'ux', messages);
}
