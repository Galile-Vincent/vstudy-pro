import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useOverlayFocusReturn(open: boolean) {
  const [initialOpener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const opener = useRef<HTMLElement | null>(initialOpener);
  const captureOpener = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    // Preserve the opener across StrictMode's effect replay after modal autofocus.
    if (!opener.current) captureOpener();
    return () => {
      const target = opener.current;
      queueMicrotask(() => {
        if (target?.isConnected && document.activeElement === document.body) target.focus();
      });
    };
  }, [open, captureOpener]);
  useLayoutEffect(() => {
    if (!open) opener.current = null;
  }, [open]);
  return captureOpener;
}
