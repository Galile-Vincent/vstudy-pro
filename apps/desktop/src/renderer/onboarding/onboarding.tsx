/** Resumable first-run sequence. School and appearance setup stay with their owning features. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Document, Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Select } from '../components/select';
import { desktop } from '../bridge';
import { saveLanguage } from '../i18n';
import { useOptionalNavigation } from '../shell';
import { AppearanceSection } from '../settings/appearance';
import { UploadCard } from '../home/upload-card';
import { errorText } from '../status';
import { ProductPreview } from './product-preview';
import { goals, saveProgress, steps, useLearningProgress, type LearningProgress } from './progress';
import { Walkthrough } from './walkthrough';
import './onboarding.css';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const progress = useLearningProgress();
  const [step, setStep] = useState<LearningProgress['step']>(() => progress.status === 'completed' ? 'welcome' : progress.step);
  const [language, setLanguage] = useState<Settings['language']>('auto');
  const [imported, setImported] = useState<Document>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const index = steps.indexOf(step);
  useEffect(() => {
    void desktop.invoke('settings:get', {}).then(s => setLanguage(s.language)).catch(e => setError(errorText(e)));
    if (progress.documentId) void desktop.invoke('documents:get', { documentId: progress.documentId }).then(doc => { if (doc) setImported(doc); }).catch(e => setError(errorText(e)));
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const move = (next: LearningProgress['step']) => {
    try { saveProgress({ step: next, status: 'active' }); setStep(next); setError(''); }
    catch { setError(tr('onboarding:save_error')); }
  };
  const exit = async (complete: boolean, action?: 'goal' | 'providers') => {
    setBusy(true); setError('');
    try {
      const settings = await desktop.invoke('settings:get', {});
      await desktop.invoke('settings:set', { ...settings, onboardingCompleted: true });
      saveProgress({ step, status: complete ? 'completed' : 'paused', done: complete ? [...new Set([...progress.done, 'setup' as const])] : progress.done });
      onComplete();
      if (action === 'providers') window.dispatchEvent(new CustomEvent('vstudy:open-settings', { detail: { tab: 'providers' } }));
      else if (action === 'goal') {
        if (progress.goal === 'school') navigation?.navigate('courses');
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
    setBusy(true);
    try { await saveLanguage('language', value); setLanguage(value); setError(''); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) void exit(false); }}>
    <DialogContent showCloseButton={false} className="onboarding" aria-labelledby="onboarding-title" aria-describedby="onboarding-intro" onPointerDownOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}>
      <div className="onboarding-top"><p role="status">{tr('onboarding:progress', { current: index + 1, total: steps.length })}</p><Button variant="ghost" disabled={busy} onClick={() => void exit(false)}>{tr('onboarding:later')}</Button></div>
      <div className="onboarding-progress" aria-hidden="true">{steps.map(item => <span key={item} data-current={item === step}/>)}</div>
      <DialogTitle asChild><h1 id="onboarding-title" ref={heading} tabIndex={-1}>{tr(`onboarding:step_${step}`)}</h1></DialogTitle>
      <p id="onboarding-intro" className="onboarding-intro">{tr(`onboarding:step_${step}_body`)}</p>
      <div className="onboarding-content" key={step} tabIndex={0} role="region" aria-labelledby="onboarding-title">
        {step === 'welcome' && <><ProductPreview/><p>{tr('onboarding:offline_promise')}</p></>}
        {step === 'language' && <label>{tr('onboarding:language')}<Select value={language} disabled={busy} onChange={e => void chooseLanguage(e.target.value as Settings['language'])}><option value="auto">{tr('common:auto')}</option><option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option></Select></label>}
        {step === 'appearance' && <AppearanceSection/>}
        {step === 'goal' && <fieldset className="onboarding-goals"><legend className="motion-sr">{tr('onboarding:step_goal')}</legend>{goals.map(goal => <label key={goal} data-selected={progress.goal === goal}><input type="radio" name="onboarding-goal" value={goal} checked={progress.goal === goal} onChange={() => { try { saveProgress({ goal, documentId: undefined }); setImported(undefined); } catch { setError(tr('onboarding:save_error')); } }}/><span><strong>{tr(`onboarding:goal_${goal}`)}</strong><small>{tr(`onboarding:goal_${goal}_body`)}</small></span></label>)}</fieldset>}
        {step === 'ai' && <><dl className="onboarding-ai">{['free', 'paid', 'login', 'privacy', 'keychain'].map(item => <div key={item}><dt>{tr(`onboarding:ai_${item}`)}</dt><dd>{tr(`onboarding:ai_${item}_body`)}</dd></div>)}</dl></>}
        {step === 'start' && <>
          <p>{tr(`onboarding:before_${progress.goal}`)}</p>
          {progress.goal === 'documents' && <UploadCard showOpen={false} showSample={false} onImported={doc => { setImported(doc); try { saveProgress({ documentId: doc.id, done: [...new Set([...progress.done, 'document' as const])] }); } catch { setError(tr('onboarding:save_error')); } }}/>}
          {progress.goal === 'sample' && <Button variant="outline" disabled={busy || !!imported} onClick={() => void addSample()}>{tr(imported ? 'onboarding:sample_added' : 'onboarding:sample')}</Button>}
          <Walkthrough lesson={progress.goal === 'school' ? 'school' : 'selection'}/>
        </>}
      </div>
      {imported && <p role="status">{tr('onboarding:ready_to_open', { title: imported.title })}</p>}
      {error && <p role="alert">{error}</p>}
      <footer>{step === 'ai' && <Button variant="outline" disabled={busy} onClick={() => void exit(false, 'providers')}>{tr('onboarding:configure_ai')}</Button>}{index > 0 && <Button variant="outline" disabled={busy} onClick={() => move(steps[index - 1]!)}>{tr('onboarding:back')}</Button>}<Button className="primary" disabled={busy || (step === 'start' && progress.goal === 'sample' && !imported)} onClick={() => step === 'start' ? void exit(true, 'goal') : move(steps[index + 1]!)}>{tr(step === 'start' ? progress.goal === 'school' ? 'onboarding:open_courses' : imported || progress.goal === 'sample' ? 'onboarding:open_document' : 'onboarding:open_library' : step === 'ai' ? 'onboarding:skip_ai' : 'onboarding:next')}</Button></footer>
    </DialogContent>
  </Dialog>;
}
