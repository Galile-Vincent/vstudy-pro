import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudyPrefs } from '../../shared/review';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import './memory-consent.css';
import { Button } from '../components/ui/button';

/** "Not now" lasts until the app restarts (session storage), so the card never nags twice in one session. */
const POSTPONED = 'vstudy.memoryConsentPostponed';
let postponedFallback = false;
const isPostponed = () => { try { return sessionStorage.getItem(POSTPONED) === '1'; } catch { return postponedFallback; } };
const postpone = () => { postponedFallback = true; try { sessionStorage.setItem(POSTPONED, '1'); } catch { /* The in-memory flag still holds for this window. */ } };
const focusable = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** One-time consent for study memory. Extraction stays off in main until the student turns it on here or in Settings. */
export function MemoryConsentCard() {
  useTranslation();
  const [prefs, setPrefs] = useState<StudyPrefs | null>(null);
  const [state, setState] = useState<'ask' | 'done' | 'hidden'>(() => isPostponed() ? 'hidden' : 'ask');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isPostponed()) return;
    let active = true;
    desktop.invoke('review:prefs:get', {}).then(value => { if (active) setPrefs(value); }).catch(() => { /* No card without readable preferences. */ });
    return () => { active = false; };
  }, []);
  const leave = (next: 'done' | 'hidden') => {
    const root = card.current;
    const target = root && Array.from(root.parentElement?.querySelectorAll<HTMLElement>(focusable) ?? []).find(element => !root.contains(element));
    setState(next);
    target?.focus();
  };
  async function turnOn() {
    setBusy(true); setError(false);
    try { setPrefs(await desktop.invoke('review:prefs:set', { memoryEnabled: true, consentAcknowledged: true })); leave('done'); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  if (state === 'done') return <p role="status" className="review-consent-done">{tr('review:consent_done')}</p>;
  if (state === 'hidden' || !prefs || !prefs.memoryEnabled || prefs.consentAcknowledged) return null;
  return <section ref={card} className="review-consent" aria-labelledby="review-consent-title">
    <div className="review-consent-body" role="region" aria-labelledby="review-consent-title" tabIndex={0}>
    <h2 id="review-consent-title">{tr('review:consent_title')}</h2>
    <p>{tr('review:memory_disclosure')}</p>
    </div>
    <div className="review-actions">
      <Button type="button" disabled={busy} onClick={() => void turnOn()}>{tr('review:consent_turn_on')}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { postpone(); leave('hidden'); }}>{tr('review:consent_not_now')}</Button>
    </div>
    {error && <p role="alert">{tr('review:error')}</p>}
  </section>;
}
