import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TutorMode } from '../shared/domain';
import { tr } from '../shared/i18n';
import { Button } from './components/ui/button';

/** localStorage belongs to the current Electron user profile, never to a provider. */
export function useTutorMode() {
  const [mode, setMode] = useState<TutorMode>(() => {
    try { return localStorage.getItem('vstudy.tutorMode') === 'socratic' ? 'socratic' : 'direct'; }
    catch { return 'direct'; }
  });
  return [mode, (next: TutorMode) => {
    setMode(next);
    try { localStorage.setItem('vstudy.tutorMode', next); } catch { /* Storage is optional. */ }
  }] as const;
}

/** Native checkbox is keyboard operable and introduces no motion. */
export function TutorModeControl({mode, onChange, onAnswer}: {mode: TutorMode; onChange: (mode: TutorMode) => void; onAnswer: () => void}) {
  useTranslation();
  return <span><label title={tr('chat:socratic_description')}><input type="checkbox" checked={mode === 'socratic'} onChange={event => onChange(event.target.checked ? 'socratic' : 'direct')}/>{tr('chat:socratic_mode')}</label>{mode === 'socratic' && <Button type="button" size="sm" variant="ghost" onClick={onAnswer}>{tr('chat:answer_directly')}</Button>}</span>;
}
