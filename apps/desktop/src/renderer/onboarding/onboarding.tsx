import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { errorText } from "../status";
import { useOptionalNavigation } from "../shell";
import { Select } from "../components/select";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IpcResponse, Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { saveLanguage } from '../i18n';
import { ProviderRow } from '../provider-row';
import { providerName } from '../provider-metadata';
import { AnimatedText } from '../motion/animated-text';
import { UploadCard } from '../home/upload-card';
import './onboarding.css';
import { ProductPreview } from './product-preview';
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [step, setStep] = useState(0);
  const [providers, setProviders] = useState<IpcResponse<'providers:list'>>([]);
  const [language, setLanguage] = useState<Settings['language']>('auto');
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState<'openai-api' | 'anthropic-api'>('openai-api');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitingKeychain,setWaitingKeychain] = useState(false);

  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = async () => { try { setProviders(await desktop.invoke('providers:list', {})); } catch { setError(tr('errors:generic')); } };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    void desktop.invoke('settings:get', {}).then(s => { setLanguage(s.language); setName(s.displayName ?? ''); }).catch(() => setError(tr('errors:generic')));
    void refresh();
    return () => { if (previous?.isConnected && previous !== document.body) previous.focus(); else document.getElementById("shell-content")?.focus(); };
  }, []);
  useEffect(() => { heading.current?.focus(); setError(''); setNotice(''); }, [step]);
  const finish = async (tour = false) => {
    setBusy(true);
    try { const settings = await desktop.invoke('settings:get', {}); await desktop.invoke('settings:set', { ...settings, displayName: name.trim() || undefined, onboardingCompleted: true }); onComplete(); if (tour) navigation?.navigate("welcome"); }
    catch { setError(tr('errors:generic')); } finally { setBusy(false); }
  };
  const advance = () => { if (step < 3) setStep(step + 1); else void finish(); };
  const titles = ['welcome', 'connect', 'bring', 'coach'];
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)void finish();}}><DialogContent showCloseButton={false} aria-describedby={undefined} className="onboarding" aria-labelledby="onboarding-title" onPointerDownOutside={event=>event.preventDefault()} onOpenAutoFocus={event=>{event.preventDefault();heading.current?.focus();}}>

    <div className="onboarding-progress" role="group" aria-label={tr('onboarding:progress', { current: step + 1, total: 4 })}>{titles.map((title, index) => <span key={title} data-current={index === step} aria-hidden="true" />)}</div>
    <DialogTitle asChild><h1 ref={heading} tabIndex={-1} id="onboarding-title">{tr(`onboarding:${titles[step]}`)}</h1></DialogTitle>
    <p className="onboarding-intro"><AnimatedText texts={[tr(`onboarding:${titles[step]}_body`)]}/></p>
    <div className="onboarding-content" key={step}>
      {step === 0 && <><ProductPreview/><label>{tr('onboarding:language')}<Select value={language} disabled={busy} onChange={e => { const value = e.target.value as Settings['language']; setBusy(true); void saveLanguage('language', value).then(() => setLanguage(value)).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}><option value="auto">{tr('common:auto')}</option><option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option></Select></label><label>{tr('onboarding:name')}<Input maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label></>}
      {step === 1 && <><div className="onboarding-providers">{providers.filter(p => p.config.kind === 'cli').map(p => <ProviderRow key={p.config.id} provider={p} onRefresh={refresh} />)}</div><p className="muted">{tr('onboarding:signin')}</p><Button variant="outline" disabled={busy} onClick={() => void refresh()}>{tr('onboarding:refresh')}</Button><form onSubmit={e => { e.preventDefault(); setBusy(true); setWaitingKeychain(true); setError(''); void (async () => { try { await desktop.invoke('secrets:set', { providerId, key: key.trim() }); setKey(''); await desktop.invoke('providers:configure', { kind: 'api', id: providerId, enabled: true }); setNotice(tr('onboarding:key_saved')); await refresh(); } catch (error) { setError(errorText(error)); } finally { setWaitingKeychain(false); setBusy(false); } })(); }}><label>{tr('onboarding:api_provider')}<Select value={providerId} onChange={e => setProviderId(e.target.value as typeof providerId)}><option value="openai-api">{providerName['openai-api']}</option><option value="anthropic-api">{providerName['anthropic-api']}</option></Select></label><label>{tr('onboarding:key')}<Input type="password" autoComplete="off" maxLength={16384} value={key} onChange={e => setKey(e.target.value)}/></label><Button variant="outline" disabled={busy || !key.trim()}>{tr(error && key.trim() ? 'settings:retry' : 'onboarding:save_key')}</Button><Button variant="outline" type="button" disabled={busy || !key.trim()} onClick={() => {setBusy(true);setError('');void desktop.invoke('secrets:session',{providerId,key:key.trim()}).then(async()=>{setKey('');setNotice(tr('settings:session_ready'));await refresh();}).catch(error=>setError(errorText(error))).finally(()=>setBusy(false));}}>{tr('settings:session_key')}</Button></form></>}
      {step === 2 && <><UploadCard showSample={false}/><Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void desktop.invoke('documents:importSample', { language: language === 'auto' ? document.documentElement.lang.startsWith('ja') ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en' : language }).then(() => { setNotice(tr('onboarding:sample_added')); window.dispatchEvent(new Event('activity-updated')); window.dispatchEvent(new Event('library-changed')); }).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}>{tr('onboarding:sample')}</Button></>}
      {step === 3 && <ol className="onboarding-tips">{['select', 'pin', 'usage'].map(tip => <li key={tip}>{tr(`onboarding:tip_${tip}`)}</li>)}</ol>}
    </div>
    {waitingKeychain && <p role="status">{tr("settings:waiting")}</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <footer>{step === 3 && <Button variant="outline" className="ghost" disabled={busy} onClick={() => void finish(true)}>{tr("welcome:tour")}</Button>}{step > 0 && <Button variant="outline" disabled={busy} onClick={() => setStep(step - 1)}>{tr('onboarding:back')}</Button>}{step < 3 && <Button variant="outline" className="ghost" disabled={busy} onClick={advance}>{tr('onboarding:skip')}</Button>}<Button variant="outline" className="primary" disabled={busy} onClick={advance}>{tr(step === 3 ? 'onboarding:finish' : 'onboarding:next')}</Button></footer>
  </DialogContent></Dialog>;
}
