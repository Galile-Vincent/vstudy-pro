import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { InternationalizationProvider, Theme } from '@astryxdesign/core';
import ja from '@astryxdesign/core/locales/ja-JP.generated.js';
import zh from '@astryxdesign/core/locales/zh-TW.generated.js';
import { useTranslation } from 'react-i18next';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

const messages = { 'ja-JP': ja, 'zh-TW': zh };
const locales: Record<string, string> = { en: 'en', ja: 'ja-JP', 'zh-Hant': 'zh-TW' };
const root = document.documentElement;
const getMode = () => root.classList.contains('dark') ? 'dark' : 'light';
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function AstryxTheme({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const locale = locales[i18n.resolvedLanguage ?? i18n.language] ?? 'en';
  const mode = useSyncExternalStore(subscribe, getMode);
  const palette = root.dataset.theme;
  useLayoutEffect(() => {
    // Astryx claims data-theme for mode; VStudy owns it for contrast/palette selectors.
    if (palette) root.dataset.theme = palette;
  }, [mode, palette]);
  return <InternationalizationProvider locale={locale} messages={messages}><Theme theme={neutralTheme} mode={mode}>{children}</Theme></InternationalizationProvider>;
}
