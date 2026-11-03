import { useEffect } from 'react';
import type { Document } from '../../shared';
import { desktop } from '../bridge';
export function useReadingActivity(documentId: Document['id'] | null, visible: boolean) {
  useEffect(() => {
    if (!documentId || !visible) return;
    let interacted = -Infinity;
    let previous = performance.now();
    let seconds = 0;
    const interaction = () => { interacted = performance.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(event => window.addEventListener(event, interaction, { passive: true }));
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(1, (now - previous) / 1000);
      previous = now;
      if (document.visibilityState === 'visible' && document.hasFocus() && !document.querySelector('dialog[open]') && now - interacted <= 30_000) seconds += elapsed;
      if (seconds >= 15) {
        const counted = Math.min(60, Math.floor(seconds)); seconds -= counted;
        void desktop.invoke('activity:heartbeat', { documentId, seconds: counted }).then(() => window.dispatchEvent(new Event('activity-updated'))).catch(() => {});
      }
    }, 1000);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, interaction)); };
  }, [documentId, visible]);
}
