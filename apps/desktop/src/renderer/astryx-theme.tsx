import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Theme } from '@astryxdesign/core';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

const root = document.documentElement;
const getMode = () => root.classList.contains('dark') ? 'dark' : 'light';
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function AstryxTheme({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getMode);
  const palette = root.dataset.theme;
  useLayoutEffect(() => {
    // Astryx claims data-theme for mode; VStudy owns it for contrast/palette selectors.
    if (palette) root.dataset.theme = palette;
  }, [mode, palette]);
  return <Theme theme={neutralTheme} mode={mode}>{children}</Theme>;
}
