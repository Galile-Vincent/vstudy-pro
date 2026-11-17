/** Global Help entry points and contextual, profile-local learning guidance. */
import { Button, Dialog, DialogHeader, DropdownMenu, IconButton, Popover, ProgressBar, SegmentedControl, SegmentedControlItem } from '@astryxdesign/core';
import { ListRow, Section } from '../components/ui';
import { Panel } from '../components/panel';
import { Brand } from '../components/brand';
import { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { Onboarding } from './onboarding';
import { isInsideDialog, returnFocusTo } from './return-focus';
import { markLearned, saveProgress, useLearningProgress } from './progress';
import { lessons, Walkthrough, type Lesson } from './walkthrough';
import './guidance.css';

type HelpView = 'setup' | 'walkthroughs' | 'shortcuts' | 'checklist';
export function openLearningHelp(view: HelpView) {
  window.dispatchEvent(new CustomEvent('vstudy:learning-help', { detail: view }));
}
export function HelpMenu() {
  useTranslation();
  return <DropdownMenu
    placement="below"
    alignment="end"
    hasChevron={false}
    button={{ label: tr('onboarding:help'), variant: 'ghost', size: 'sm', icon: <CircleHelp size={16}/>, tooltip: tr('onboarding:help_hint'), className: 'learning-help-trigger' }}
    items={(['setup', 'walkthroughs', 'shortcuts'] as const).map(view => ({ label: tr(`onboarding:help_${view}`), onClick: () => openLearningHelp(view) }))}
  />;
}
export function LearningHelp() {
  useTranslation();
  const [view, setView] = useState<HelpView>();
  const { route } = useNavigate();
  const navigating = useRef(false);
  const opener = useRef<Element | null>(null);
  const restoreFocus = returnFocusTo(() => opener.current);
  const focusDestination = () => {
    document.querySelector<HTMLElement>('#shell-content')?.focus();
  };
  useEffect(() => {
    if (navigating.current && route?.view === 'library' && !view) focusDestination();
  }, [route?.view, view]);
  const [lesson, setLesson] = useState<Lesson>('school');
  useEffect(() => {
    const show = (event: Event) => {
      const next = (event as CustomEvent<HelpView>).detail;
      navigating.current = false;
      if (!isInsideDialog(document.activeElement)) opener.current = document.activeElement;
      setView(next);
      try { markLearned('help'); } catch { /* Help must open when profile storage is unavailable. */ }
    };
    window.addEventListener('vstudy:learning-help', show);
    return () => window.removeEventListener('vstudy:learning-help', show);
  }, []);
  const close = () => { setView(undefined); window.setTimeout(() => restoreFocus(new Event('close')), 0); };
  if (view === 'setup') return <Onboarding onComplete={() => setView(undefined)} onCloseAutoFocus={restoreFocus}/>;
  if (view === 'checklist') return <Dialog isOpen onOpenChange={open => { if (!open) { if (navigating.current) focusDestination(); else close(); setView(undefined); } }} width={560} className="learning-dialog" aria-label={tr('onboarding:checklist')}>
    <GettingStarted detailed dialogTitle onNavigate={() => { navigating.current = true; setView(undefined); window.setTimeout(focusDestination, 0); }}/>
  </Dialog>;
  if (!view) return null;
  return (
    <Dialog isOpen onOpenChange={open => { if (!open) close(); }} width={640} className="learning-dialog">
      <DialogHeader title={tr(`onboarding:help_${view}`)} startContent={<Brand lockup/>} onOpenChange={open => { if (!open) close(); }}/>
      <div className="learning-body">
        {view === 'walkthroughs' ? (
          <>
            <p>{tr('onboarding:walkthroughs_body')}</p>
            <SegmentedControl label={tr('onboarding:help_walkthroughs')} value={lesson} onChange={value => setLesson(value as Lesson)}>
              {lessons.map(item => (
                <SegmentedControlItem key={item} value={item} label={tr(`onboarding:lesson_${item}`)}/>
              ))}
            </SegmentedControl>
            <Walkthrough key={lesson} lesson={lesson}/>
          </>
        ) : (
          <>
            <p>{tr('onboarding:shortcuts_body')}</p>
            <dl className="learning-shortcuts">
              {['selection', 'sidebar', 'send', 'newline', 'dismiss', 'navigate'].map(key => (
                <div key={key}>
                  <dt>{tr(`onboarding:shortcut_${key}`)}</dt>
                  <dd><kbd>{tr(`onboarding:keys_${key}`)}</kbd></dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </Dialog>
  );
}
export function GettingStarted({ detailed = false, dialogTitle = false, onNavigate }: {
  detailed?: boolean; dialogTitle?: boolean; onNavigate?: () => void;
}) {
  useTranslation();
  const progress = useLearningProgress();
  const { navigate } = useNavigate();
  const [error, setError] = useState('');
  const hasDocument = progress.done.includes('document');
  useEffect(() => {
    if (hasDocument) return;
    const refresh = () => {
      void desktop
        .invoke('documents:list', {})
        .then((documents) => {
          if (documents.some((doc) => doc.status === 'ready')) markLearned('document');
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('library-changed', refresh);
    const unsubscribe = desktop.onDocumentProgress?.(refresh);
    return () => {
      window.removeEventListener('library-changed', refresh);
      unsubscribe?.();
    };
  }, [hasDocument]);
  const items = ['setup', 'document', 'walkthrough', 'help'] as const;
  if (!detailed && items.every((item) => progress.done.includes(item))) {
    return (
      <div className="flex flex-wrap items-center gap-[var(--space-3)]">
        <span className="flex items-center gap-[var(--space-2)] text-[var(--muted)]">
          <Check size={16} aria-hidden="true" />
          {tr('onboarding:setup_complete')}
        </span>
        <Button variant="ghost" label={tr('onboarding:setup_help')} onClick={() => openLearningHelp('checklist')}/>
      </div>
    );
  }
  const title = tr('onboarding:checklist');
  const count = <span className="text-[var(--muted)]">{tr('onboarding:checklist_progress', { current: progress.done.length, total: items.length })}</span>;
  const content = (
    <>
      <p>{tr('onboarding:checklist_body')}</p>
      <ProgressBar
        className="art-reader-setup-progress"
        label={tr('onboarding:checklist')}
        isLabelHidden
        value={(progress.done.length / items.length) * 100}
      />
      <div role="list">
        {items.map((item) => {
          const done = progress.done.includes(item);
          return (
            <ListRow
              key={item}
              role="listitem"
              data-complete={done}
              leading={<span className="grid size-[var(--space-5)] place-items-center">{done && <Check size={16} aria-hidden="true" />}</span>}
              title={tr(`onboarding:check_${item}`)}
              meta={done ? tr('onboarding:completed') : undefined}
              onClick={() =>
                item === 'document'
                  ? (onNavigate?.(), navigate('library'))
                  : openLearningHelp(item === 'walkthrough' ? 'walkthroughs' : item === 'help' ? 'shortcuts' : 'setup')
              }
            />
          );
        })}
      </div>
      {progress.status === 'paused' && (
        <Button
          variant="secondary"
          label={tr('onboarding:resume')}
          onClick={() => {
            try {
              saveProgress({ status: 'active' });
              openLearningHelp('setup');
            } catch {
              setError(tr('onboarding:save_error'));
            }
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
  return dialogTitle
    ? <Section title={title} actions={count}>{content}</Section>
    : <Panel title={title} actions={count}><div className="grid gap-[var(--space-3)] py-[var(--space-3)]">{content}</div></Panel>;
}
export function ContextCoach({ inline = false }: { inline?: boolean }) {
  useTranslation();
  const { route } = useNavigate();
  const progress = useLearningProgress();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const kind = route.view === 'workspace' ? 'workspace' : route.view === 'courses' ? 'courses' : null;
  if (!kind || progress.dismissed.includes(kind) || (kind === 'workspace' && !inline)) return null;
  const dismiss = () => { try { saveProgress({ dismissed: [...progress.dismissed, kind] }); } catch { setError(tr('onboarding:save_error')); } };
  if (kind === 'workspace') return <Popover alignment="start" label={tr('art-reader:tip')} content={<div className="art-reader-coach">
    <strong>{tr('onboarding:coach_workspace')}</strong><p>{tr('onboarding:coach_workspace_body')}</p>
    <Button variant="ghost" label={tr('onboarding:help_walkthroughs')} onClick={() => openLearningHelp('walkthroughs')}/>
    <IconButton variant="ghost" label={tr('onboarding:dismiss_tip')} icon={<X size={16}/>} onClick={dismiss}/>
    {error && <p role="alert">{error}</p>}
  </div>}><IconButton variant="ghost" className="art-reader-coach-trigger" label={tr('art-reader:tip')} tooltip={tr('art-reader:tip')} icon={<CircleHelp size={16}/>}/></Popover>;
  return <aside className="context-coach" aria-label={tr('onboarding:tip')}><div><details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><strong>{tr(`onboarding:coach_${kind}`)}</strong></summary><p>{tr(`onboarding:coach_${kind}_body`)}</p></details><Button variant="ghost" label={tr('onboarding:help_walkthroughs')} onClick={() => openLearningHelp('walkthroughs')}/>{error && <p role="alert">{error}</p>}</div><IconButton variant="ghost" label={tr('onboarding:dismiss_tip')} tooltip={tr('onboarding:dismiss_tip')} icon={<X size={16}/>} onClick={dismiss}/></aside>;
}
