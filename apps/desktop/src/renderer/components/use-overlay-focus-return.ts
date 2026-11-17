import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const focusedElement = () => {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
};

const restoreFocus = (target: HTMLElement | null) => setTimeout(() => {
  if (focusedElement()) return;
  if (target?.isConnected) target.focus();
  else document.getElementById('shell-content')?.focus();
}, 0);

export function useOverlayFocusReturn(open: boolean) {
  const [initialOpener] = useState(focusedElement);
  const opener = useRef<HTMLElement | null>(initialOpener);
  const returnTarget = useRef<HTMLElement | null>(initialOpener);
  const captureOpener = useCallback(() => {
    opener.current = focusedElement();
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    // Preserve the opener across StrictMode's effect replay after modal autofocus.
    if (!opener.current) captureOpener();
    returnTarget.current = opener.current;
    return () => { restoreFocus(opener.current); };
  }, [open, captureOpener]);
  useLayoutEffect(() => {
    if (!open) opener.current = null;
  }, [open]);
  // Overlays that unmount after an exit animation still hold focus when `open` flips.
  useLayoutEffect(() => () => { restoreFocus(returnTarget.current); }, []);
  return captureOpener;
}
