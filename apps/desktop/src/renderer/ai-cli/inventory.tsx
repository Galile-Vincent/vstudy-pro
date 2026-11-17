/** Persistent, non-interrupting AI tools entry. Inventory is file-only until a student requests an action. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button, Card } from '@astryxdesign/core';
import { Section, SettingRow } from '../components/ui';
import { aiCliChanged, openAiCliSetup } from './entry';
import { cliNames, recommendedProvider } from './model';
import { useCliTools } from './use-tools';
import './setup.css';

export function AiCliInventory({ compact = false, settings = false }: { compact?: boolean; settings?: boolean }) {
  useTranslation();
  const { tools, error, refresh } = useCliTools();
  const [busy, setBusy] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [checked, setChecked] = useState(false);
  const ready = tools.some(tool => tool.consented && tool.tested);
  const updates = tools.some(tool => tool.status === 'update-available');
  const statusLabel = (tool: typeof tools[number]) => tr(tool.status === 'update-available' && tool.manualUpdateRequired ? 'ai-cli:manual_update' : `ai-cli:status_${tool.status}`);
  const releaseNotes = (tool: typeof tools[number]) => tool.status === 'update-available' && tool.manualUpdateRequired && tool.releaseNotesUrl && <Button label={tr('ai-cli:vendor_install_link')} variant="ghost" onClick={() => void desktop.invoke('shell:openExternal', { url: tool.releaseNotesUrl! }).catch(() => setCheckError(true))} />;
  const checkUpdates = <Button label={tr(busy ? 'ai-cli:checking' : 'ai-cli:check_now')} variant={settings ? 'secondary' : 'ghost'} size={settings ? 'sm' : 'md'} isDisabled={busy} onClick={() => {
    setBusy(true); setCheckError(false); setChecked(false);
    void desktop.invoke('ai-cli:checkUpdates', {}).then(async () => { await refresh(); aiCliChanged(); setChecked(true); }).catch(() => setCheckError(true)).finally(() => setBusy(false));
  }} />;
  const notes = <>
    {updates && <p className="ai-cli-update-note">{tr('ai-cli:updates_available')}</p>}
    {checked && <p role="status">{tr('ai-cli:checked')}</p>}
    {(error || checkError) && <p role="status">{tr('ai-cli:inventory_error')}</p>}
  </>;
  const summary = error ? tr('ai-cli:inventory_error') : ready
    ? `${cliNames[recommendedProvider(tools)]} · ${tr('ai-cli:ready_title')}` : tr('ai-cli:summary_unconnected');
  const entry = <Button label={tr('ai-cli:title')} variant="secondary" icon={<Sparkles aria-hidden="true" />} onClick={() => openAiCliSetup()} />;
  if (settings) return <Section level={3} title={tr('ai-cli:tools')}><Card padding={4} className="settings-stack">
    <SettingRow label={summary}><span role="status" className="sr-only">{summary}</span>{entry}</SettingRow>
  </Card></Section>;
  return <section className="ai-cli-inventory" data-compact={compact} aria-label={tr('ai-cli:tools')}>
    <Button label={`${tr('ai-cli:tools')} · ${tr(ready ? 'ai-cli:ready_title' : 'ai-cli:setup_needed')}`} variant="ghost" icon={<Sparkles aria-hidden="true" />} onClick={() => { openAiCliSetup(); }}><span>{tr('ai-cli:tools')}</span><span className="ai-cli-dot" data-ready={ready} aria-hidden="true" /></Button>
    <div className="ai-cli-versions">{tools.map(tool => <div key={tool.provider} className="ai-cli-version-entry"><button type="button" className="ai-cli-version" title={tr(`ai-cli:status_${tool.status}`)} onClick={() => { openAiCliSetup(tool.provider); }}><span>{cliNames[tool.provider]}</span><code>{tool.version ?? tr('ai-cli:missing')}</code><small>{statusLabel(tool)}</small></button>{releaseNotes(tool)}</div>)}</div>
    {checkUpdates}
    {notes}
  </section>;
}
