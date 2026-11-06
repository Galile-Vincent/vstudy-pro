import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { newsletterEmail } from '../shared/newsletter';
import { desktop } from './bridge';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
export function Newsletter({ onConsent }: { onConsent: (emailProvided: boolean, optedIn: boolean) => void }) {
  useTranslation();
  const [available, setAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<'idle' | 'busy' | 'accepted' | 'failed'>('idle');
  const valid = newsletterEmail.safeParse(email).success;
  useEffect(() => { void desktop.invoke('newsletter:getConfig', {}).then(c => setAvailable(c.available)).catch(() => {}); }, []);
  useEffect(() => { onConsent(available && valid, available && valid && checked); }, [available, valid, checked, onConsent]);
  if (!available) return null;
  return <section className="analytics-newsletter">
    <label>{tr('analytics:email')}<Input type="email" autoComplete="email" value={email} disabled={status === 'busy' || status === 'accepted'} aria-describedby="newsletter-hint" onChange={e => { setEmail(e.target.value); setChecked(false); setStatus('idle'); }}/></label>
    <p id="newsletter-hint">{tr('analytics:email_hint')}</p>
    <label className="analytics-check"><input type="checkbox" checked={checked} disabled={!valid || status === 'busy' || status === 'accepted'} onChange={e => setChecked(e.target.checked)}/>{tr('analytics:updates')}</label>
    <Button variant="secondary" disabled={!valid || !checked || status === 'busy' || status === 'accepted'} onClick={() => {
      setStatus('busy');
      const locale = document.documentElement.lang === 'ja' ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en';
      void desktop.invoke('newsletter:subscribe', {email, locale, source:'onboarding', consent:true}).then(r => setStatus(r.accepted ? 'accepted' : 'failed')).catch(() => setStatus('failed'));
    }}>{tr(status === 'failed' ? 'analytics:retry' : 'analytics:subscribe')}</Button>
    {status !== 'idle' && <p role="status">{tr(`analytics:newsletter_${status}`)}</p>}
  </section>;
}
