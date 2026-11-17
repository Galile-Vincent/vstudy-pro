import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { newsletterEmail } from '../shared/newsletter';
import { desktop } from './bridge';
import { Button, TextInput } from '@astryxdesign/core';
export function Newsletter({ onConsent }: { onConsent: (emailProvided: boolean, optedIn: boolean) => void }) {
  useTranslation();
  const [available, setAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'accepted' | 'failed'>('idle');
  const valid = newsletterEmail.safeParse(email).success;
  useEffect(() => { void desktop.invoke('newsletter:getConfig', {}).then(c => setAvailable(c.available)).catch(() => {}); }, []);
  useEffect(() => { onConsent(available && valid, available && status === 'accepted'); }, [available, valid, status, onConsent]);
  if (!available) return null;
  return <section className="analytics-newsletter">
    <TextInput label={tr('analytics:email')} type="email" autoComplete="email" value={email} isDisabled={status === 'busy' || status === 'accepted'} aria-describedby="newsletter-hint" onChange={value => { setEmail(value); setStatus('idle'); }} />
    <p id="newsletter-hint">{tr('analytics:email_hint')}</p>
    <p>{tr('analytics:updates')}</p>
    <Button label={tr(status === 'failed' ? 'analytics:retry' : 'analytics:subscribe')} variant="secondary" isDisabled={!valid || status === 'busy' || status === 'accepted'} onClick={() => {
      setStatus('busy');
      const locale = document.documentElement.lang === 'ja' ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en';
      void desktop.invoke('newsletter:subscribe', {email, locale, source:'onboarding', consent:true}).then(r => setStatus(r.accepted ? 'accepted' : 'failed')).catch(() => setStatus('failed'));
    }} />
    {status !== 'idle' && <p role="status">{tr(`analytics:newsletter_${status}`)}</p>}
  </section>;
}
