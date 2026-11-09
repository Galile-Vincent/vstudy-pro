/** Three-step school connection. Credentials are submitted once and never retained in recent sites. */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GraduationCap, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MoodleAccount, MoodleSchool, MoodleSiteCheck } from '../../shared/moodle';
import { moodleSiteCheckSchema } from '../../shared/moodle';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Input, FormField, ListRow } from '../components/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import type { MoodleApi } from './api';

import { SchoolPicker, SchoolLogo } from './school-picker';
export { fuzzySiteMatch } from './school-search';

type Flow = {step:'find'} | {step:'result'|'sign-in';site:MoodleSiteCheck};
const recentKey = 'vstudy-moodle-recent-sites';
function recentSites(): MoodleSiteCheck[] {
  try { return moodleSiteCheckSchema.array().parse(JSON.parse(localStorage.getItem(recentKey) ?? '[]')).slice(0,5); } catch { return []; }
}
function authErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = /moodle\.auth_(invalidlogin|usernotfullysetup|webservices_disabled|requirecorrectaccess|sso_required|cancelled|timeout|callback_invalid|load_failed|blocked|disposed)/.exec(message)?.[1];
  return code ? `moodle:auth_${code.replaceAll('_','-')}` : 'moodle:connect_error';
}
export function ConnectDialog({open,onOpenChange,api,onConnected,accounts = []}: {
  accounts?:MoodleAccount[]|undefined;open:boolean;onOpenChange:(open:boolean) => void;api:MoodleApi;onConnected:() => Promise<void>;
}) {
  useTranslation('moodle');
  const [flow,setFlow] = useState<Flow>({step:'find'});
  const [input,setInput] = useState('');
  const [schools,setSchools] = useState<MoodleSchool[]>([]);
  const [recent,setRecent] = useState<MoodleSiteCheck[]>([]);
  const [busy,setBusy] = useState<'checking'|'permission'|'connecting' | null>(null);
  const [ssoMode,setSsoMode] = useState<import('../../shared/moodle').MoodleSsoMode | null>(null);
  const [error,setError] = useState('');
  const [storage,setStorage] = useState<'secure'|'session'>('secure');
  const [unsaved,setUnsaved] = useState<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (!open) return;
    const generation = ++sequence.current;
    setUnsaved(null); setStorage('secure'); setFlow({step:'find'}); setInput(''); setError(''); setBusy(null); setRecent(recentSites());
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
    if (/^http:\/\//i.test(url)) {setError('schools:https_required');return;}
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^https:\/\//i.test(url) || /[?&](?:qrlogin|qrloginkey|token|wstoken)=/i.test(url)) {setError('schools:qr_unsupported');return;}
    setBusy('checking'); setError('');
    try {
      const site = await api.checkSite(url.trim());
      if (generation !== sequence.current) return;
      setFlow({step:'result',site});
      const next = [site,...recent.filter(item => item.siteUrl !== site.siteUrl)].slice(0,5);
      setRecent(next);
      try {localStorage.setItem(recentKey,JSON.stringify(next.map(({siteUrl,siteName,country,authPlan}) => ({siteUrl,siteName,country,authPlan}))));} catch { /* Recent sites are optional. */ }
    } catch {if (generation === sequence.current) setError('moodle:site_check_error');}
    finally {if (generation === sequence.current) setBusy(null);}
  };
  const prepare = async () => {
    if (flow.step !== 'result' || busy) return;
    const generation = ++sequence.current;
    setBusy('permission'); setError('');
    try {
      const {ready} = await api.preflight();
      if (generation !== sequence.current) return;
      if (ready) {setStorage('secure');setFlow({step:'sign-in',site:flow.site});}
      else setError('moodle:keychain_error');
    } catch {if (generation === sequence.current) setError('moodle:keychain_error');}
    finally {if (generation === sequence.current) setBusy(null);}
  };
  const connect = async (provider?: number, credentials?: {username:string;password:string}) => {
    if (flow.step !== 'sign-in' || busy) return;
    const generation = ++sequence.current;
    setBusy('connecting'); setError('');
    try {
      const account = await api.connect({siteUrl:flow.site.siteUrl,...(storage === 'session' ? {storage} : {}),...(provider === undefined ? {} : {provider}),...credentials});
      if (generation !== sequence.current) return;
      await onConnected();
      if (account.signInStorage === 'unsaved') setUnsaved(account.id);
      else onOpenChange(false);
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
      {unsaved ? <div role="status"><p>{tr('moodle:keychain_unsaved')}</p>
        <Button disabled={!!busy} onClick={() => {
          setBusy('permission');setError('');
          void api.retrySave(unsaved).then(async () => {await onConnected();onOpenChange(false);}).catch(() => setError('moodle:keychain_error')).finally(() => setBusy(null));
        }}>{tr('moodle:keychain_retry')}</Button>
        <Button disabled={!!busy} onClick={() => onOpenChange(false)}>{tr('moodle:keychain_session')}</Button>
      </div> : flow.step === 'find' ? <>
        <SchoolPicker schools={schools} recent={recent} accounts={accounts} input={input} onInput={value => {setInput(value);setError('');}} busy={!!busy} onFind={url => void find(url)} />
      </> : <>
        <ListRow className="moodle-site-result" role="status" leading={<SchoolLogo name={flow.site.siteName} icon={flow.site.iconUrl} />}
          title={flow.site.siteName} subtitle={new URL(flow.site.siteUrl).host + new URL(flow.site.siteUrl).pathname.replace(/\/$/,'')}
          meta={<><ShieldCheck aria-hidden="true" />{tr(`moodle:method_${plan!.kind}`)}</>} />
        {plan?.kind === 'unavailable' ? <div role="alert" className="moodle-connect-unavailable"><strong>{tr(plan.reason === 'unsupported-login' ? 'schools:unsupported_login' : `moodle:unavailable_${plan.reason}`)}</strong><p>{tr(plan.reason === 'unsupported-login' ? 'schools:unsupported_login_next' : `moodle:next_${plan.reason}`)}</p></div> : flow.step === 'result' ? <Button disabled={!!busy} onClick={() => void prepare()}><ArrowRight />{tr(error === 'moodle:keychain_error' ? 'moodle:keychain_retry' : 'moodle:continue_sign_in')}</Button> : plan?.kind === 'password' ? <form className="moodle-connect-form" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
          const username = String(data.get('username') ?? ''); const password = String(data.get('password') ?? '');
          form.reset(); void connect(undefined,{username,password});
        }}>
          <FormField controlId="moodle-username" label={tr('moodle:username')} children={field => <Input {...field} name="username" autoComplete="username" required maxLength={256} disabled={!!busy} />} />
          <FormField controlId="moodle-password" label={tr('moodle:password')} children={field => <Input {...field} name="password" type="password" autoComplete="current-password" required maxLength={4096} disabled={!!busy} />} />
          <Button type="submit" disabled={!!busy}>{busy && <LoaderCircle className="moodle-spin" />}{tr(busy ? 'moodle:connecting' : 'moodle:password_sign_in')}</Button>
          <small>{tr('moodle:password_hint')}</small>
        </form> : <div className="moodle-connect-form">
          {plan && 'providers' in plan && plan.providers.length ? plan.providers.map((provider,index) => <Button key={`${provider.url}:${index}`} disabled={!!busy} onClick={() => void connect(index)}>{busy ? <LoaderCircle className="moodle-spin" /> : <ShieldCheck />}{tr('moodle:continue_provider',{name:provider.name})}</Button>) : <Button disabled={!!busy} onClick={() => void connect()}>{busy && <LoaderCircle className="moodle-spin" />}{tr('moodle:sign_in')}</Button>}
          <small>{tr('moodle:sign_in_hint')}</small>
        </div>}
        {flow.step === 'sign-in' && plan?.kind === 'password' && plan.providers?.map((provider,index) => <Button key={`${provider.url}:${index}`} disabled={!!busy} onClick={() => void connect(index)}><ShieldCheck />{tr('moodle:continue_provider',{name:provider.name})}</Button>)}
        {flow.site.maintenanceMessage && plan?.kind === 'unavailable' && <p>{flow.site.maintenanceMessage}</p>}
        {plan?.kind !== 'unavailable' && <small>{tr(flow.site.registration === 'browser' ? 'schools:signup_browser' : 'schools:signup_disabled')}</small>}
        {flow.site.qrLogin && <small>{tr('schools:qr_unsupported')}</small>}
        <Button variant="ghost" disabled={!!busy} onClick={() => {setError('');setFlow(flow.step === 'sign-in' ? {step:'result',site:flow.site} : {step:'find'});}}><ArrowLeft />{tr('moodle:back')}</Button>
      </>}
      {busy === 'permission' && <div role="status"><p>{tr('moodle:keychain_waiting')}</p><p>{tr('moodle:keychain_hint')}</p></div>}
      {!unsaved && error === 'moodle:keychain_error' && flow.step === 'result' && <Button disabled={!!busy} onClick={() => {setStorage('session');setError('');setFlow({step:'sign-in',site:flow.site});}}>{tr('moodle:keychain_session')}</Button>}
      {ssoMode && <div role="status"><p>{tr(ssoMode === 'external' ? 'moodle:waiting_browser' : 'moodle:waiting_embedded')}</p><Button variant="ghost" onClick={() => {if (activeSite) void api.ssoCancel(activeSite).catch(() => setError('moodle:connect_error'));}}>{tr('moodle:sso_cancel')}</Button></div>}
      {error && <p className="moodle-connect-error" role="alert">{tr(error)}</p>}
      {busy && <span className="sr-only" role="status">{tr(busy === 'checking' ? 'moodle:checking_site' : busy === 'permission' ? 'moodle:keychain_waiting' : 'moodle:connecting')}</span>}
    </DialogContent>
  </Dialog>;
}
