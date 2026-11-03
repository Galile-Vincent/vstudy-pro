import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { AnimatedText } from './animated-text';
export function BlankChat({ documentOpen = false, hasSelection = false, replyLanguage, onStart, disabled }: { documentOpen?: boolean; hasSelection?: boolean; replyLanguage?: string; onStart?: () => void; disabled?: boolean }) {
  useTranslation();
  const context = hasSelection ? 'selection' : documentOpen ? 'document' : 'start';
  return <div className="blank-chat"><Sparkles aria-hidden="true" /><h3>{tr('home:chat_title')}</h3><p><AnimatedText texts={[tr(`home:question_${context}_1`), tr(`home:question_${context}_2`), ...(replyLanguage && replyLanguage !== 'auto' ? [tr('home:question_language')] : [])]} /></p>{onStart && <button className="primary" disabled={disabled} onClick={onStart}>{tr('common:start_a_conversation')}</button>}</div>;
}
