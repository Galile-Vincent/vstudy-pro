import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GraduationCap, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MoodleSchool, MoodleSiteCheck } from '../../shared/moodle';
import { moodleSiteCheckSchema } from '../../shared/moodle';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import type { MoodleApi } from './api';

type Flow = {step:'find'} | {step:'result'|'sign-in';site:MoodleSiteCheck};
const recentKey = 'vstudy-moodle-recent-sites';
function recentSites(): MoodleSiteCheck[] {
  try { return moodleSiteCheckSchema.array().parse(JSON.parse(localStorage.getItem(recentKey) ?? '[]')).slice(0,5); } catch { return []; }
}
export function fuzzySiteMatch(query: string, text: string): boolean {
  const needle = query.toLocaleLowerCase().replace(/^https?:\/\//,'').trim();
  let index = 0;
  for (const character of text.toLocaleLowerCase()) if (character === needle[index]) index++;
  return index === needle.length;
}
function authErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = /moodle\.auth_(invalidlogin|usernotfullysetup|webservices_disabled|requirecorrectaccess|sso_required|cancelled|timeout|callback_invalid|load_failed|blocked|disposed)/.exec(message)?.[1];
  return code ? `moodle:auth_${code.replaceAll('_','-')}` : 'moodle:connect_error';
}
export function ConnectDialog({open,onOpenChange,api,onConnected}: {
  open:boolean;onOpenChange:(open:boolean) => void;api:MoodleApi;onConnected:() => Promise<void>;
}) {
  useTranslation('moodle');
  const [flow,setFlow] = useState<Flow>({step:'find'});
  const [input,setInput] = useState('');
  const [schools,setSchools] = useState<MoodleSchool[]>([]);
  const [recent,setRecent] = useState<MoodleSiteCheck[]>([]);
  const [busy,setBusy] = useState<'checking'|'connecting' | null>(null);
  const [ssoMode,setSsoMode] = useState<import('../../shared/moodle').MoodleSsoMode | null>(null);
  const [error,setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    if (!open) return;
    const generation = ++sequence.current;
    setFlow({step:'find'}); setInput(''); setError(''); setBusy(null); setRecent(recentSites());
    void api.schools().then(items => {if (generation === sequence.current) setSchools(items);}).catch(() => {if (generation === sequence.current) setError('moodle:presets_error');});
    return () => {sequence.current++;};
  },[open,api]);
  const activeSite = open && flow.step === 'sign-in' && busy === 'connecting' ? flow.site.siteUrl : null;
  useEffect(() => {
    setSsoMode(null);
    if (!activeSite) return;
    let active = true;
    const update = () => { void api.ssoState(activeSite).then(mode => {if (active) setSsoMode(mode);}).catch(() => {}); };
    update();
    const timer = setInterval(update,250);
    return () => {active = false;clearInterval(timer);void api.ssoCancel(activeSite).catch(() => {});};
  },[activeSite,api]);
  const find = async (url = input) => {
    if (!url.trim() || busy) return;
    const generation = ++sequence.current;
    setBusy('checking'); setError('');
    try {
      const site = await api.checkSite(url.trim());
      if (generation !== sequence.current) return;
      setFlow({step:'result',site});
      const next = [site,...recent.filter(item => item.siteUrl !== site.siteUrl)].slice(0,5);
      setRecent(next);
      try {localStorage.setItem(recentKey,JSON.stringify(next));} catch { /* Recent sites are optional. */ }
    } catch {if (generation === sequence.current) setError('moodle:site_check_error');}
    finally {if (generation === sequence.current) setBusy(null);}
  };
  const connect = async (provider?: number, credentials?: {username:string;password:string}) => {
    if (flow.step !== 'sign-in' || busy) return;
    const generation = ++sequence.current;
    setBusy('connecting'); setError('');
    try {
      await api.connect({siteUrl:flow.site.siteUrl,...(provider === undefined ? {} : {provider}),...credentials});
      if (generation !== sequence.current) return;
      await onConnected(); onOpenChange(false);
    } catch (cause) {
      if (generation !== sequence.current) return;
      const key = authErrorKey(cause);
      setError(key);
      if (key === 'moodle:auth_sso-required') {
        try {const site = await api.checkSite(flow.site.siteUrl); if (generation === sequence.current) setFlow({step:'sign-in',site});} catch {setFlow({step:'result',site:flow.site});}
      }
    } finally {if (generation === sequence.current) setBusy(null);}
  };
  const step = flow.step === 'find' ? 0 : flow.step === 'result' ? 1 : 2;
  const plan = flow.step === 'find' ? undefined : flow.site.authPlan;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="moodle-connect" aria-busy={busy !== null}>
      <GraduationCap aria-hidden="true" />
      <DialogTitle>{tr('moodle:connect_title')}</DialogTitle>
      <DialogDescription>{tr('moodle:connect_description')}</DialogDescription>
      <ol className="moodle-connect-steps" aria-label={tr('moodle:connect_steps')}>
        {['find_school','check_school','sign_in_step'].map((label,index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span>{step > index ? '✓' : index+1}</span>{tr(`moodle:${label}`)}</li>)}
      </ol>
      {flow.step === 'find' ? <>
        <form onSubmit={event => {event.preventDefault();void find();}} className="moodle-connect-form">
          <label htmlFor="moodle-site">{tr('moodle:site_address')}</label>
          <Input id="moodle-site" value={input} autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder={tr('moodle:site_placeholder')} disabled={!!busy} aria-describedby="moodle-url-hint" onChange={event => {setInput(event.target.value);setError('');}} onPaste={event => {const text = event.clipboardData.getData('text').trim();if (/^(https:\/\/)?[^\s]+\.[^\s]+$/i.test(text)) {event.preventDefault();setInput(text);setError('');}}} />
          <small id="moodle-url-hint">{tr('moodle:site_address_hint')}</small>
          <Button type="submit" disabled={!input.trim() || !!busy}>{busy === 'checking' ? <LoaderCircle className="moodle-spin" /> : <ArrowRight />}{tr(busy === 'checking' ? 'moodle:checking_site' : 'moodle:check_site')}</Button>
        </form>
        {!!recent.length && <div className="moodle-site-list"><h3>{tr('moodle:recent_sites')}</h3>{recent.filter(site => fuzzySiteMatch(input,`${site.siteName} ${site.siteUrl}`)).map(site => <Button key={site.siteUrl} variant="ghost" disabled={!!busy} onClick={() => void find(site.siteUrl)}><GraduationCap /><span>{site.siteName}<small>{new URL(site.siteUrl).host}</small></span><ArrowRight /></Button>)}</div>}
        <div className="moodle-site-list"><h3>{tr('moodle:suggested_sites')}</h3>{schools.filter(site => fuzzySiteMatch(input,`${site.name} ${site.host}`)).map(site => <Button key={site.id} variant="ghost" disabled={!!busy} onClick={() => void find(site.host)}><GraduationCap /><span>{site.name}<small>{new URL(site.host).host}</small></span><ArrowRight /></Button>)}</div>
      </> : <>
        <div className="moodle-site-result" role="status">
          {flow.site.iconUrl ? <img src={flow.site.iconUrl} alt="" /> : <span className="moodle-site-icon"><GraduationCap /></span>}
          <div><h3>{flow.site.siteName}</h3><p>{new URL(flow.site.siteUrl).host}{new URL(flow.site.siteUrl).pathname.replace(/\/$/,'')}</p></div>
          <ShieldCheck aria-hidden="true" />
          <small>{tr(`moodle:method_${plan!.kind}`)}</small>
        </div>
        {plan?.kind === 'unavailable' ? <div role="alert" className="moodle-connect-unavailable"><strong>{tr(`moodle:unavailable_${plan.reason}`)}</strong><p>{tr(`moodle:next_${plan.reason}`)}</p></div> : flow.step === 'result' ? <Button onClick={() => {setError('');setFlow({step:'sign-in',site:flow.site});}}><ArrowRight />{tr('moodle:continue_sign_in')}</Button> : plan?.kind === 'password' ? <form className="moodle-connect-form" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
          const username = String(data.get('username') ?? ''); const password = String(data.get('password') ?? '');
          form.reset(); void connect(undefined,{username,password});
        }}>
          <label htmlFor="moodle-username">{tr('moodle:username')}</label><Input id="moodle-username" name="username" autoComplete="username" required maxLength={256} disabled={!!busy} />
          <label htmlFor="moodle-password">{tr('moodle:password')}</label><Input id="moodle-password" name="password" type="password" autoComplete="current-password" required maxLength={4096} disabled={!!busy} />
          <Button type="submit" disabled={!!busy}>{busy && <LoaderCircle className="moodle-spin" />}{tr(busy ? 'moodle:connecting' : 'moodle:password_sign_in')}</Button>
          <small>{tr('moodle:password_hint')}</small>
        </form> : <div className="moodle-connect-form">
          {plan && 'providers' in plan && plan.providers.length ? plan.providers.map((provider,index) => <Button key={`${provider.url}:${index}`} disabled={!!busy} onClick={() => void connect(index)}>{busy ? <LoaderCircle className="moodle-spin" /> : <ShieldCheck />}{tr('moodle:continue_provider',{name:provider.name})}</Button>) : <Button disabled={!!busy} onClick={() => void connect()}>{busy && <LoaderCircle className="moodle-spin" />}{tr('moodle:sign_in')}</Button>}
          <small>{tr('moodle:sign_in_hint')}</small>
        </div>}
        <Button variant="ghost" disabled={!!busy} onClick={() => {setError('');setFlow(flow.step === 'sign-in' ? {step:'result',site:flow.site} : {step:'find'});}}><ArrowLeft />{tr('moodle:back')}</Button>
      </>}
      {ssoMode && <div role="status"><p>{tr(ssoMode === 'external' ? 'moodle:waiting_browser' : 'moodle:waiting_embedded')}</p><Button variant="ghost" onClick={() => {if (activeSite) void api.ssoCancel(activeSite).catch(() => setError('moodle:connect_error'));}}>{tr('moodle:sso_cancel')}</Button></div>}
      {error && <p className="moodle-connect-error" role="alert">{tr(error)}</p>}
      {busy && <span className="sr-only" role="status">{tr(busy === 'checking' ? 'moodle:checking_site' : 'moodle:connecting')}</span>}
    </DialogContent>
  </Dialog>;
}
