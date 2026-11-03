import { useOptionalNavigation } from "../shell";
import { Select } from "../components/select";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IpcResponse, Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { saveLanguage } from '../i18n';
import { providerName } from '../providers';
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
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = async () => { try { setProviders(await desktop.invoke('providers:list', {})); } catch { setError(tr('errors:generic')); } };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void desktop.invoke('settings:get', {}).then(s => { setLanguage(s.language); setName(s.displayName ?? ''); }).catch(() => setError(tr('errors:generic')));
    void refresh();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { heading.current?.focus(); setError(''); setNotice(''); }, [step]);
  const finish = async (tour = false) => {
    setBusy(true);
    try { const settings = await desktop.invoke('settings:get', {}); await desktop.invoke('settings:set', { ...settings, displayName: name.trim() || undefined, onboardingCompleted: true }); onComplete(); if (tour) navigation?.navigate("welcome"); }
    catch { setError(tr('errors:generic')); } finally { setBusy(false); }
  };
  const advance = () => { if (step < 3) setStep(step + 1); else void finish(); };
  const titles = ['welcome', 'connect', 'bring', 'coach'];
  return <dialog ref={dialog} className="onboarding" aria-labelledby="onboarding-title" onCancel={e => { e.preventDefault(); if (!busy) void finish(); }}>
    <div className="onboarding-progress" role="group" aria-label={tr('onboarding:progress', { current: step + 1, total: 4 })}>{titles.map((title, index) => <span key={title} data-current={index === step} aria-hidden="true" />)}</div>
    <h1 ref={heading} tabIndex={-1} id="onboarding-title">{tr(`onboarding:${titles[step]}`)}</h1>
    <p className="onboarding-intro"><AnimatedText texts={[tr(`onboarding:${titles[step]}_body`)]}/></p>
    <div className="onboarding-content">
      {step === 0 && <><ProductPreview/><label>{tr('onboarding:language')}<Select value={language} disabled={busy} onChange={e => { const value = e.target.value as Settings['language']; setBusy(true); void saveLanguage('language', value).then(() => setLanguage(value)).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}><option value="auto">{tr('common:auto')}</option><option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option></Select></label><label>{tr('onboarding:name')}<input maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label></>}
      {step === 1 && <><ul className="onboarding-providers">{providers.filter(p => p.config.kind === 'cli').map(p => <li key={p.config.id}><strong>{providerName[p.config.id]}</strong><span>{tr(p.availability.available ? 'onboarding:ready' : 'onboarding:not_ready')}</span></li>)}</ul><p className="muted">{tr('onboarding:signin')}</p><button disabled={busy} onClick={() => void refresh()}>{tr('onboarding:refresh')}</button><form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void (async () => { try { await desktop.invoke('secrets:set', { providerId, key: key.trim() }); setKey(''); await desktop.invoke('providers:configure', { kind: 'api', id: providerId, enabled: true }); setNotice(tr('onboarding:key_saved')); await refresh(); } catch { setError(tr('errors:generic')); } finally { setBusy(false); } })(); }}><label>{tr('onboarding:api_provider')}<Select value={providerId} onChange={e => setProviderId(e.target.value as typeof providerId)}><option value="openai-api">{providerName['openai-api']}</option><option value="anthropic-api">{providerName['anthropic-api']}</option></Select></label><label>{tr('onboarding:key')}<input type="password" autoComplete="off" maxLength={16384} value={key} onChange={e => setKey(e.target.value)}/></label><button disabled={busy || !key.trim()}>{tr('onboarding:save_key')}</button></form></>}
      {step === 2 && <><UploadCard showSample={false}/><button disabled={busy} onClick={() => { setBusy(true); void desktop.invoke('documents:importSample', { language: language === 'auto' ? document.documentElement.lang.startsWith('ja') ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en' : language }).then(() => { setNotice(tr('onboarding:sample_added')); window.dispatchEvent(new Event('activity-updated')); }).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}>{tr('onboarding:sample')}</button></>}
      {step === 3 && <ol className="onboarding-tips">{['select', 'pin', 'usage'].map(tip => <li key={tip}>{tr(`onboarding:tip_${tip}`)}</li>)}</ol>}
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <footer>{step === 3 && <button className="ghost" disabled={busy} onClick={() => void finish(true)}>{tr("welcome:tour")}</button>}{step > 0 && <button disabled={busy} onClick={() => setStep(step - 1)}>{tr('onboarding:back')}</button>}{step < 3 && <button className="ghost" disabled={busy} onClick={advance}>{tr('onboarding:skip')}</button>}<button className="primary" disabled={busy} onClick={advance}>{tr(step === 3 ? 'onboarding:finish' : 'onboarding:next')}</button></footer>
  </dialog>;
}
