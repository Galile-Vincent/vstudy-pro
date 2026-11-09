/** Global Help entry points and contextual, profile-local learning guidance. */
import { Card, Section } from '../components/ui';
import { Brand } from '../components/brand';
import { useEffect, useId, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Progress } from '../components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { useNavigate } from '../shell';
import { Onboarding } from './onboarding';
import { markLearned, saveProgress, useLearningProgress } from './progress';
import { lessons, Walkthrough, type Lesson } from './walkthrough';
import './guidance.css';

type HelpView = 'setup' | 'walkthroughs' | 'shortcuts' | 'checklist';
export function openLearningHelp(view: HelpView) {
  window.dispatchEvent(new CustomEvent('vstudy:learning-help', { detail: view }));
}
export function HelpMenu() {
  useTranslation();
  return <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" className="learning-help-trigger"><CircleHelp size={16}/>{tr('onboarding:help')}</Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{tr('onboarding:help_hint')}</TooltipContent></Tooltip><DropdownMenuContent align="end">{(['setup', 'walkthroughs', 'shortcuts'] as const).map(view => <DropdownMenuItem key={view} onSelect={() => openLearningHelp(view)}>{tr(`onboarding:help_${view}`)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
export function LearningHelp() {
  useTranslation();
  const [view, setView] = useState<HelpView>();
  const titleId = useId();
  const [lesson, setLesson] = useState<Lesson>('school');
  useEffect(() => {
    const show = (event: Event) => {
      const next = (event as CustomEvent<HelpView>).detail;
      setView(next);
      try { markLearned('help'); } catch { /* Help must open when profile storage is unavailable. */ }
    };
    window.addEventListener('vstudy:learning-help', show);
    return () => window.removeEventListener('vstudy:learning-help', show);
  }, []);
  if (view === 'setup') return <Onboarding onComplete={() => setView(undefined)}/>;
  if (view === 'checklist') return <Dialog open onOpenChange={open => { if (!open) setView(undefined); }}>
    <DialogContent aria-describedby={undefined} aria-labelledby={titleId}>
      <GettingStarted detailed titleId={titleId} onNavigate={() => setView(undefined)}/>
    </DialogContent>
  </Dialog>;
  if (!view) return null;
  return <Dialog open onOpenChange={open => { if (!open) setView(undefined); }}><DialogContent className="learning-dialog" aria-describedby={undefined} showCloseButton={false}>
    <Brand lockup/><header><DialogTitle>{tr(`onboarding:help_${view}`)}</DialogTitle><Button variant="ghost" size="icon" aria-label={tr('common:close')} onClick={() => setView(undefined)}><X size={18}/></Button></header>
    {view === 'walkthroughs' ? <><p>{tr('onboarding:walkthroughs_body')}</p><nav className="learning-lessons" aria-label={tr('onboarding:help_walkthroughs')}>{lessons.map(item => <Button variant={lesson === item ? 'secondary' : 'ghost'} aria-pressed={lesson === item} key={item} onClick={() => setLesson(item)}>{tr(`onboarding:lesson_${item}`)}</Button>)}</nav><Walkthrough key={lesson} lesson={lesson}/></> : <><p>{tr('onboarding:shortcuts_body')}</p><dl className="learning-shortcuts">{['selection', 'sidebar', 'send', 'newline', 'dismiss', 'navigate'].map(key => <div key={key}><dt>{tr(`onboarding:shortcut_${key}`)}</dt><dd><kbd>{tr(`onboarding:keys_${key}`)}</kbd></dd></div>)}</dl></>}
  </DialogContent></Dialog>;
}
export function GettingStarted({ detailed = false, titleId, onNavigate }: {
  detailed?: boolean; titleId?: string; onNavigate?: () => void;
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
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
        <span className="flex items-center gap-[var(--space-2)]">
          <Check size={16} aria-hidden="true" />
          {tr('onboarding:setup_complete')}
        </span>
        <Button variant="ghost" onClick={() => openLearningHelp('checklist')}>
          {tr('onboarding:setup_help')}
        </Button>
      </div>
    );
  }
  return (
    <Card
      variant="flat"
      className="getting-started min-w-0 p-[var(--space-6)]"
    >
      <Section
        title={titleId ? <DialogTitle asChild id={titleId}><span>{tr('onboarding:checklist')}</span></DialogTitle> : tr('onboarding:checklist')}
        actions={
          <span>{tr('onboarding:checklist_progress', { current: progress.done.length, total: items.length })}</span>
        }
      >
        <p>{tr('onboarding:checklist_body')}</p>
        <Progress
          className="art-reader-setup-progress"
          aria-label={tr('onboarding:checklist')}
          value={(progress.done.length / items.length) * 100}
        />
        <ol>
          {items.map((item) => (
            <li key={item} data-complete={progress.done.includes(item)}>
              <span aria-hidden="true">{progress.done.includes(item) ? <Check size={16} /> : null}</span>
              <Button
                variant="ghost"
                onClick={() =>
                  item === 'document'
                    ? (onNavigate?.(), navigate('library'))
                    : openLearningHelp(
                        item === 'walkthrough' ? 'walkthroughs' : item === 'help' ? 'shortcuts' : 'setup'
                      )
                }
              >
                {tr(`onboarding:check_${item}`)}
                {progress.done.includes(item) && <small>{tr('onboarding:completed')}</small>}
              </Button>
            </li>
          ))}
        </ol>
        {progress.status === 'paused' && (
          <Button
            variant="outline"
            onClick={() => {
              try {
                saveProgress({ status: 'active' });
                openLearningHelp('setup');
              } catch {
                setError(tr('onboarding:save_error'));
              }
            }}
          >
            {tr('onboarding:resume')}
          </Button>
        )}
        {error && <p role="alert">{error}</p>}
      </Section>
    </Card>
  );
}
export function ContextCoach({ inline = false }: { inline?: boolean }) {
  useTranslation();
  const { route } = useNavigate();
  const progress = useLearningProgress();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const kind = route.view === 'workspace' ? 'workspace' : route.view === 'courses' ? 'courses' : null;
  if (!kind || progress.dismissed.includes(kind) || (kind === 'workspace' && !inline)) return null;
  if (kind === 'workspace') return <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="art-reader-coach-trigger"><CircleHelp size={15}/>{tr('art-reader:tip')}</Button></PopoverTrigger><PopoverContent align="start" className="art-reader-coach">
    <strong>{tr('onboarding:coach_workspace')}</strong><p>{tr('onboarding:coach_workspace_body')}</p>
    <Button variant="link" onClick={() => openLearningHelp('walkthroughs')}>{tr('onboarding:help_walkthroughs')}</Button>
    <Button variant="ghost" size="icon" aria-label={tr('onboarding:dismiss_tip')} onClick={() => { try { saveProgress({ dismissed: [...progress.dismissed, kind] }); } catch { setError(tr('onboarding:save_error')); } }}><X size={16}/></Button>
    {error && <p role="alert">{error}</p>}
  </PopoverContent></Popover>;
  return <aside className="context-coach" aria-label={tr('onboarding:tip')}><div><details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><strong>{tr(`onboarding:coach_${kind}`)}</strong></summary><p>{tr(`onboarding:coach_${kind}_body`)}</p></details><Button variant="ghost" onClick={() => openLearningHelp('walkthroughs')}>{tr('onboarding:help_walkthroughs')}</Button>{error && <p role="alert">{error}</p>}</div><Tooltip><TooltipTrigger asChild><Button variant="ghost" aria-label={tr('onboarding:dismiss_tip')} onClick={() => { try { saveProgress({ dismissed: [...progress.dismissed, kind] }); } catch { setError(tr('onboarding:save_error')); } }}><X size={16}/></Button></TooltipTrigger><TooltipContent>{tr('onboarding:dismiss_tip')}</TooltipContent></Tooltip></aside>;
}
