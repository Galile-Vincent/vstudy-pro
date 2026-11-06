/** Persistent, non-interrupting AI tools entry. Inventory is file-only until a student requests an action. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { aiCliChanged, openAiCliSetup } from './entry';
import { cliNames } from './model';
import { useCliTools } from './use-tools';
import './setup.css';

export function AiCliInventory({ compact = false }: { compact?: boolean }) {
  useTranslation();
  const { tools, error, refresh } = useCliTools();
  const [busy, setBusy] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [checked, setChecked] = useState(false);
  const ready = tools.some(tool => tool.consented && tool.tested);
  const updates = tools.some(tool => tool.status === 'update-available');
  return <section className="ai-cli-inventory" data-compact={compact} aria-label={tr('ai-cli:tools')}>
    <Button variant="ghost" className="ai-cli-inventory-entry" onClick={() => { openAiCliSetup(); }}><Sparkles size={16} aria-hidden="true" /><span>{tr('ai-cli:tools')}</span><span className="ai-cli-dot" data-ready={ready} aria-hidden="true" /><span className="sr-only">{tr(ready ? 'ai-cli:ready_title' : 'ai-cli:setup_needed')}</span></Button>
    <div className="ai-cli-versions">{tools.map(tool => <div key={tool.provider} className="ai-cli-version-entry"><button type="button" className="ai-cli-version" title={tr(`ai-cli:status_${tool.status}`)} onClick={() => { openAiCliSetup(tool.provider); }}><span>{cliNames[tool.provider]}</span><code>{tool.version ?? tr('ai-cli:missing')}</code><small>{tr(tool.status === 'update-available' && tool.manualUpdateRequired ? 'ai-cli:manual_update' : `ai-cli:status_${tool.status}`)}</small></button>{tool.status === 'update-available' && tool.manualUpdateRequired && tool.releaseNotesUrl && <Button variant="link" onClick={() => void desktop.invoke('shell:openExternal', { url: tool.releaseNotesUrl! }).catch(() => setCheckError(true))}>{tr('ai-cli:vendor_install_link')}</Button>}</div>)}</div>
    {updates && <p className="ai-cli-update-note">{tr('ai-cli:updates_available')}</p>}
    <Button variant="ghost" disabled={busy} onClick={() => {
      setBusy(true); setCheckError(false); setChecked(false);
      void desktop.invoke('ai-cli:checkUpdates', {}).then(async () => { await refresh(); aiCliChanged(); setChecked(true); }).catch(() => setCheckError(true)).finally(() => setBusy(false));
    }}>{tr(busy ? 'ai-cli:checking' : 'ai-cli:check_now')}</Button>
    {checked && <p role="status">{tr('ai-cli:checked')}</p>}
    {(error || checkError) && <p role="status">{tr('ai-cli:inventory_error')}</p>}
  </section>;
}
