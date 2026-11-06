/** Resumable first-run sequence. School and appearance setup stay with their owning features. */
import { useCallback, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { acquisitionSource, type AcquisitionSource } from '../../shared/analytics';
import { AnalyticsDisclosure, ConsentChoice, completeAnalyticsOnboarding } from '../analytics-ui';
import { Newsletter } from '../newsletter';
import { track } from '../analytics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Document, Settings } from '../../shared';
import { systemLanguage, tr } from '../../shared/i18n';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { desktop } from '../bridge';
import { saveLanguage } from '../i18n';
import { useOptionalNavigation } from '../shell';
import { applyAppearance } from '../settings/apply-appearance';
import { ThemePreview } from '../settings/theme-preview';
import { resolveTheme } from '../../shared/themes';
import '../settings/appearance.css';
import { UploadCard } from '../home/upload-card';
import { errorText } from '../status';
import { ProductPreview } from './product-preview';
import { goals, saveProgress, steps, useLearningProgress, type LearningProgress } from './progress';
import { Walkthrough } from './walkthrough';
import './onboarding.css';

function ChoiceCard({ name, value, checked, disabled, onChange, onReselect, title, description, lang, children }: {
  name: string; value: string; checked: boolean; disabled?: boolean; onChange: () => void; onReselect?: () => void;
  title: string; description?: string; lang?: string; children?: ReactNode;
}) {
  return <label className="onboarding-choice" data-selected={checked}>
    <input className="onboarding-choice-input" type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} onClick={() => { if (checked && !disabled) onReselect?.(); }}/>
    {children}
    <span className="onboarding-choice-copy"><strong lang={lang}>{title}</strong>{description && <small>{description}</small>}</span>
    <span className="onboarding-choice-check" aria-hidden="true">{checked && <Check size={14}/>}</span>
  </label>;
}

const typeSample = 'Aa';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  useTranslation();
  const started = useRef(Date.now());
  const [source, setSource] = useState<AcquisitionSource>();
  const newsletterConsent = useRef({email_provided:false, updates_opted_in:false});
  const [consentDone, setConsentDone] = useState(false);
  const onNewsletter = useCallback((email_provided:boolean, updates_opted_in:boolean) => { newsletterConsent.current = {email_provided, updates_opted_in}; }, []);
  const consentLock = useRef(false);
  const completeConsent = async (enabled:boolean) => {
    if (consentLock.current) return;
    consentLock.current=true;
    try { await completeAnalyticsOnboarding(enabled, {acquisition_source:source ?? acquisitionSource.enum.prefer_not_to_say,...newsletterConsent.current,duration_ms:Math.min(86400000,Date.now()-started.current)}); }
    catch (error) {consentLock.current=false;throw error;}
    setConsentDone(true);
  };
  useEffect(() => { track('onboarding_started', {onboarding_version:1}); }, []);
  const navigation = useOptionalNavigation();
  const progress = useLearningProgress();
  const [step, setStep] = useState<LearningProgress['step']>(() => progress.status === 'completed' ? 'welcome' : progress.step);
  const [language, setLanguage] = useState<Settings['language']>('auto');
  const [detected, setDetected] = useState('en');
  const [settings, setSettings] = useState<Settings>();
  const [imported, setImported] = useState<Document>();
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const index = steps.indexOf(step);
  useEffect(() => {
    void desktop.invoke('analytics:getState', {}).then(state => { setConsentDone(state.onboarding_completed); if (state.acquisition_source) setSource(state.acquisition_source); }).catch(() => {});
    void desktop.invoke('settings:get', {}).then(s => { setLanguage(s.language); setSettings(s); }).catch(e => setError(errorText(e)));
    void desktop.invoke('settings:systemLocale', {}).then(locale => setDetected(systemLanguage(locale))).catch(e => setError(errorText(e)));
    if (progress.documentId) void desktop.invoke('documents:get', { documentId: progress.documentId }).then(doc => { if (doc) setImported(doc); }).catch(e => setError(errorText(e)));
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const move = (next: LearningProgress['step']) => {
    try { saveProgress({ step: next, status: 'active' }); setStep(next); setWalkthroughOpen(false); setError(''); }
    catch { setError(tr('onboarding:save_error')); }
  };
  const exit = async (complete: boolean, action?: 'goal') => {
    setBusy(true); setError('');
    try {
      if (!consentDone) { try { await completeConsent(false); } catch { /* Optional analytics must never block entry. */ } }
      if (!complete) track('onboarding_skipped', {onboarding_version:1});
      const settings = await desktop.invoke('settings:get', {});
      await desktop.invoke('settings:set', { ...settings, onboardingCompleted: true });
      saveProgress({ step, status: complete ? 'completed' : 'paused', done: complete ? [...new Set([...progress.done, 'setup' as const])] : progress.done });
      onComplete();
      if (action === 'goal') {
        if (progress.goal === 'school') navigation?.navigate({ view: 'courses', connectSchool: true });
        else if (imported) navigation?.navigate({ view: 'workspace', documentId: imported.id });
        else navigation?.navigate('library');
      }
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const addSample = async () => {
    setBusy(true); setError('');
    try {
      const language = document.documentElement.lang.startsWith('ja') ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en';
      const sample = await desktop.invoke('documents:importSample', { language });
      setImported(sample);
      saveProgress({ documentId: sample.id, done: [...new Set([...progress.done, 'document' as const])] });
      window.dispatchEvent(new Event('library-changed')); window.dispatchEvent(new Event('activity-updated'));
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const chooseLanguage = async (value: Settings['language']) => {
    const previous = language;
    setLanguage(value);
    setBusy(true);
    try { await saveLanguage('language', value); setError(''); }
    catch (e) { setLanguage(previous); setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const chooseAppearance = async (patch: Partial<Pick<Settings, 'colorScheme' | 'uiScale'>>) => {
    const previous = settings;
    setSettings(value => value ? { ...value, ...patch } : value);
    setBusy(true);
    try {
      const latest = await desktop.invoke('settings:get', {});
      const next = await desktop.invoke('settings:set', { ...latest, ...patch });
      applyAppearance(next, true);
      setSettings(next);
      if (patch.colorScheme && patch.colorScheme !== latest.colorScheme) track('theme_changed', { theme: next.colorScheme });
      setError('');
    } catch (e) { setSettings(previous); setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) void exit(false); }}>
    <DialogContent showCloseButton={false} className="onboarding" data-step={step} aria-labelledby="onboarding-title" onPointerDownOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}>
      <div className="onboarding-top"><p role="status">{tr('onboarding:progress', { current: index + 1, total: steps.length })}</p><Button variant="ghost" disabled={busy} onClick={() => void exit(false)}>{tr('onboarding:later')}</Button></div>
      <div className="onboarding-progress" aria-hidden="true">{steps.map(item => <span key={item} data-current={item === step}/>)}</div>
      <DialogTitle asChild><h1 id="onboarding-title" ref={heading} tabIndex={-1}>{tr(`onboarding:step_${step}`)}</h1></DialogTitle>
      {step !== 'welcome' && <p id="onboarding-intro" className="onboarding-intro">{tr(`onboarding:step_${step}_body`)}</p>}
      <div className="onboarding-content" key={step} tabIndex={0} role="region" aria-labelledby="onboarding-title">
        {step === 'welcome' && <ProductPreview/>}
        {step === 'language' && <>
          <fieldset className="onboarding-choices onboarding-languages"><legend>{tr('onboarding:language')}</legend>{(['en', 'zh-Hant', 'ja'] as const).map(value => <ChoiceCard key={value} name="onboarding-language" value={value} checked={(language === 'auto' ? detected : language) === value} disabled={busy} onChange={() => void chooseLanguage(value)} onReselect={() => void chooseLanguage(value)} title={{ en: 'English', 'zh-Hant': '繁體中文', ja: '日本語' }[value]} lang={value} description={detected === value ? tr('onboarding:detected') : ''}/>)}</fieldset>
          <fieldset className="onboarding-choices onboarding-scales"><legend>{tr('settings:uiScale')}</legend>{([100, 125, 150, 200] as const).map(value => <ChoiceCard key={value} name="onboarding-scale" value={String(value)} checked={settings?.uiScale === value} disabled={busy || !settings} onChange={() => void chooseAppearance({ uiScale: value })} title={`${value}%`}><span className="onboarding-type-sample" aria-hidden="true" style={{ fontSize: `${value / 5}px` }}>{typeSample}</span></ChoiceCard>)}</fieldset>
        </>}
        {step === 'appearance' && settings && <fieldset className="onboarding-choices onboarding-schemes"><legend className="motion-sr">{tr('themes:scheme')}</legend>{(['system', 'light', 'dark'] as const).map(value => <ChoiceCard key={value} name="onboarding-scheme" value={value} checked={settings.colorScheme === value} disabled={busy} onChange={() => void chooseAppearance({ colorScheme: value })} title={tr(`themes:${value}`)}><ThemePreview theme={resolveTheme(settings)} scheme={value}/></ChoiceCard>)}</fieldset>}
        {step === 'acquisition' && <><fieldset className="analytics-sources"><legend className="motion-sr">{tr('analytics:acquisition')}</legend>{acquisitionSource.options.map(value => <label key={value}><input type="radio" name="acquisition" checked={source === value} onChange={() => setSource(value)}/>{tr(`analytics:source_${value}`)}</label>)}</fieldset><Newsletter onConsent={onNewsletter}/></>}
        {step === 'privacy' && <><AnalyticsDisclosure/><ConsentChoice busy={busy || consentDone} onChoose={enabled => { setBusy(true); void completeConsent(enabled).then(() => move('goal')).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}/></>}
        {step === 'goal' && <fieldset className="onboarding-choices onboarding-goals"><legend className="motion-sr">{tr('onboarding:step_goal')}</legend>{goals.map(goal => <ChoiceCard key={goal} name="onboarding-goal" value={goal} checked={progress.goal === goal} title={tr(`onboarding:goal_${goal}`)} description={tr(`onboarding:goal_${goal}_body`)} onChange={() => { try { saveProgress({ goal, documentId: undefined }); setImported(undefined); } catch { setError(tr('onboarding:save_error')); } }}/>)}</fieldset>}
        {step === 'start' && <>
          <p>{tr(`onboarding:before_${progress.goal}`)}</p>
          {progress.goal === 'documents' && <UploadCard showOpen={false} showSample={false} onImported={doc => { setImported(doc); try { saveProgress({ documentId: doc.id, done: [...new Set([...progress.done, 'document' as const])] }); } catch { setError(tr('onboarding:save_error')); } }}/>}
          {progress.goal === 'sample' && <Button variant="outline" disabled={busy || !!imported} onClick={() => void addSample()}>{tr(imported ? 'onboarding:sample_added' : 'onboarding:sample')}</Button>}
          <details className="onboarding-walkthrough" open={walkthroughOpen} onToggle={event => setWalkthroughOpen(event.currentTarget.open)}><summary>{tr('onboarding:help_walkthroughs')}</summary>{walkthroughOpen && <Walkthrough lesson={progress.goal === 'school' ? 'school' : 'selection'}/>}</details>
        </>}
      </div>
      {imported && <p role="status">{tr('onboarding:ready_to_open', { title: imported.title })}</p>}
      {error && <p role="alert">{error}</p>}
      <footer>{index > 0 && <Button className="onboarding-back" variant="ghost" disabled={busy} onClick={() => move(steps[index - 1]!)}>{tr('onboarding:back')}</Button>}{(step !== 'privacy' || consentDone) && <Button className="primary" disabled={busy || (step === 'start' && progress.goal === 'sample' && !imported)} onClick={() => step === 'start' ? void exit(true, 'goal') : move(steps[index + 1]!)}>{tr(step === 'start' ? progress.goal === 'school' ? 'onboarding:open_courses' : imported || progress.goal === 'sample' ? 'onboarding:open_document' : 'onboarding:open_library' : 'onboarding:next')}</Button>}</footer>
    </DialogContent>
  </Dialog>;
}
