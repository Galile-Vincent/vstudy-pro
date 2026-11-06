import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuiState } from '@assistant-ui/react';
import type { TutorMode } from '../shared/domain';
import { tr } from '../shared/i18n';
import { Button } from './components/ui/button';

const CHANGED = 'vstudy-tutor-mode';
const storageKey = (conversationId: string) => `vstudy.tutorMode.${conversationId}`;
const read = (conversationId: string): TutorMode => {
  try { return localStorage.getItem(storageKey(conversationId)) === 'socratic' ? 'socratic' : 'direct'; }
  catch { return 'direct'; }
};

/**
 * Socratic mode belongs to one conversation, so practising in one chat never makes every later chat
 * in the workspace, history and course agent Socratic. localStorage belongs to the current Electron
 * user profile, never to a provider. Chats showing the same conversation stay in step through a window event.
 */
export function useTutorMode(conversationId: string) {
  const [mode, setMode] = useState<TutorMode>(() => read(conversationId));
  useEffect(() => {
    setMode(read(conversationId));
    const changed = (event: Event) => { const detail = (event as CustomEvent<{ conversationId: string; mode: TutorMode }>).detail; if (detail.conversationId === conversationId) setMode(detail.mode); };
    window.addEventListener(CHANGED, changed);
    return () => window.removeEventListener(CHANGED, changed);
  }, [conversationId]);
  return [mode, (next: TutorMode) => {
    setMode(next);
    try { localStorage.setItem(storageKey(conversationId), next); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: { conversationId, mode: next } }));
  }] as const;
}

/** Native checkbox is keyboard operable and introduces no motion. A blocked "Just answer" stays focusable so its reason is announced. */
export function TutorModeControl({mode, onChange, onAnswer, blocked}: {mode: TutorMode; onChange: (mode: TutorMode) => void; onAnswer: () => void; blocked?: string | undefined}) {
  useTranslation();
  const reason = useId();
  return <span><label title={tr('chat:socratic_description')}><input type="checkbox" checked={mode === 'socratic'} onChange={event => onChange(event.target.checked ? 'socratic' : 'direct')}/>{tr('chat:socratic_mode')}</label>{mode === 'socratic' && <><Button type="button" size="sm" variant="ghost" aria-disabled={blocked ? true : undefined} aria-describedby={blocked ? reason : undefined} title={blocked} onClick={() => { if (!blocked) onAnswer(); }}>{tr('chat:answer_directly')}</Button>{blocked && <span id={reason} className="sr-only">{blocked}</span>}</>}</span>;
}

/** Inside the chat runtime: explains why "Just answer" cannot send right now. */
export function ChatTutorModeControl({mode, onChange, unavailable, onAnswer}: {mode: TutorMode; onChange: (mode: TutorMode) => void; unavailable: boolean; onAnswer: () => void}) {
  useTranslation();
  const running = useAuiState(state => state.thread.isRunning);
  const empty = useAuiState(state => state.thread.messages.length === 0);
  const blocked = running ? tr('chat:answer_directly_running') : unavailable ? tr('chat:answer_directly_unavailable') : empty ? tr('chat:answer_directly_empty') : undefined;
  return <TutorModeControl mode={mode} onChange={onChange} onAnswer={onAnswer} blocked={blocked}/>;
}
