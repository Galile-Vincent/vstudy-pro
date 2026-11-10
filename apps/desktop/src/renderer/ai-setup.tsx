/** Explain optional AI access without requiring a student to understand developer tools. */
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { Button } from '@astryxdesign/core';
import './ai-setup.css';

/** Keep reading available while offering an explicit route out of unavailable AI chat. */
export function AiSetupNotice({ onSettings }: { onSettings: () => void }) {
  useTranslation();
  return <aside className="ai-setup-notice" aria-label={tr('novice:ai_off')}>
    <strong>{tr('novice:ai_off')}</strong>
    <p>{tr('novice:without_ai')}</p>
    <Button label={tr('novice:connect_ai')} variant="secondary" size="sm" onClick={onSettings} />
  </aside>;
}

/** Give first-time students a complete setup sequence and a useful no-account fallback. */
export function AiSetupGuide({ onClose }: { onClose: () => void }) {
  useTranslation();
  return <section className="ai-setup-guide" aria-label={tr('novice:setup_title')}>
    <h3>{tr('novice:setup_title')}</h3>
    <p>{tr('novice:without_ai')}</p>
    <ol>
      <li>{tr('novice:step_answer')}</li>
    </ol>
    <h4>{tr('novice:no_account')}</h4>
    <p>{tr('novice:ask_school')}</p>
    <blockquote>{tr('novice:school_request')}</blockquote>
    <Button label={tr('novice:continue_reading')} variant="secondary" size="sm" onClick={onClose} />
  </section>;
}
