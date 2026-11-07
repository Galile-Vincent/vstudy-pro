/** Optional AI setup stays within the reading workflow and never obscures the composer. */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { openAiCliSetup } from '../ai-cli/entry';

/** Students can dismiss setup and continue reading without enabling a provider. */
export function ReaderOfflineNotice() {
  useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside className="ai-setup-notice art-reader-offline" aria-label={tr('novice:ai_off')}>
    <Sparkles size={18} aria-hidden="true"/>
    <strong>{tr('art-reader:offline_title')}</strong>
    <p>{tr('art-reader:offline_body')}</p>
    <div className="art-reader-offline-actions">
      <Button onClick={() => openAiCliSetup()}>{tr('art-reader:setup')}</Button>
      <Button variant="secondary" onClick={() => openAiCliSetup()}>{tr('ai-cli:wizard')}</Button>
      <Button variant="ghost" onClick={() => { setDismissed(true); window.dispatchEvent(new Event('vstudy:read-without-ai')); }}>{tr('art-reader:without_ai')}</Button>
    </div>
  </aside>;
}
