/** Explain optional AI access without requiring a student to understand developer tools. */
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { Button } from './components/ui/button';
import './ai-setup.css';

/** Keep reading available while offering an explicit route out of unavailable AI chat. */
export function AiSetupNotice({ onSettings }: { onSettings: () => void }) {
  useTranslation();
  return <aside className="ai-setup-notice" aria-label={tr('novice:ai_off')}>
    <strong>{tr('novice:ai_off')}</strong>
    <p>{tr('novice:without_ai')}</p>
    <Button variant="secondary" size="sm" onClick={onSettings}>{tr('novice:connect_ai')}</Button>
  </aside>;
}

/** Give first-time students a complete setup sequence and a useful no-account fallback. */
export function AiSetupGuide({ onClose }: { onClose: () => void }) {
  useTranslation();
  return <section className="ai-setup-guide" aria-label={tr('novice:setup_title')}>
    <h3>{tr('novice:setup_title')}</h3>
    <p>{tr('novice:without_ai')}</p>
    <ol>
      <li>{tr('novice:step_access')}</li>
      <li>{tr('novice:step_key')}</li>
      <li>{tr('novice:step_answer')}</li>
    </ol>
    <h4>{tr('novice:no_account')}</h4>
    <p>{tr('novice:ask_school')}</p>
    <blockquote>{tr('novice:school_request')}</blockquote>
    <p>{tr('novice:privacy')}</p>
    <Button variant="secondary" size="sm" onClick={onClose}>{tr('novice:continue_reading')}</Button>
  </section>;
}
