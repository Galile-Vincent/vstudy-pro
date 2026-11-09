/** Document-scoped welcome and prompt choices. The caller owns the assistant-ui runtime. */
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { Suggestions } from '../components/assistant-ui/elements/suggestions';

/** Keep title context in the actual prompt, even when the visible chip is compact. */
export function ReaderWelcome({ title, hasSelection = false, general = false, onQuestion }: {
  title: string; hasSelection?: boolean; general?: boolean; onQuestion?: ((prompt: string) => void) | undefined;
}) {
  useTranslation();
  const prompts = general ? ['general_plan', 'general_explain', 'general_quiz'] as const : ['summarize', 'explain', 'quiz'] as const;
  return <section className="art-reader-welcome">
    <div className="art-reader-assistant-mark"><Sparkles size={24} aria-hidden="true"/></div>
    <p className="art-reader-kicker">{tr('art-reader:companion')}</p>
    <h2>{tr(hasSelection ? 'art-reader:selection_title' : 'art-reader:welcome_title')}</h2>
    <p>{general ? tr('art-reader:general_welcome_body') : tr('art-reader:welcome_body', { title })}</p>
    {onQuestion && <Suggestions suggestions={prompts.map(key => tr(`art-reader:${key}`))} selectedSuggestion={null} cycle={0} variant="pills" onSuggestion={label => {
      const key = prompts.find(key => tr(`art-reader:${key}`) === label);
      if (key) onQuestion(tr(`art-reader:prompt_${key}`, { title, context: tr(hasSelection ? 'art-reader:selected_passage' : 'art-reader:open_document') }));
    }}/>}
  </section>;
}
