import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { AnimatedText } from './animated-text';
export function BlankChat({ documentOpen = false, hasSelection = false, replyLanguage, onStart, onQuestion, disabled }: { documentOpen?: boolean; hasSelection?: boolean; replyLanguage?: string; onStart?: () => void; onQuestion?: (text: string) => void; disabled?: boolean }) {
  useTranslation();
  const context = hasSelection ? 'selection' : documentOpen ? 'document' : 'start';
  return <div className="blank-chat"><Sparkles aria-hidden="true" /><h2>{tr('home:chat_title')}</h2><p><AnimatedText texts={[...(replyLanguage && replyLanguage !== 'auto' ? [tr('home:question_language')] : []), tr(`home:question_${context}_1`), tr(`home:question_${context}_2`)]} /></p>{onQuestion && !disabled && <div className="blank-suggestions">{[1,2].map(n => <button key={n} className="secondary" onClick={() => onQuestion(tr(`home:question_${context}_${n}`))}>{tr(`home:question_${context}_${n}`)}</button>)}</div>}{onStart && !disabled && <button className="primary" disabled={disabled} onClick={onStart}>{tr('common:start_a_conversation')}</button>}</div>;
}
