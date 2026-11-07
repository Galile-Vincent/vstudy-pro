import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { SettingsGroup } from '../settings/layout';
import { openAiCliSetup } from './entry';
import { cliNames, recommendedProvider } from './model';
import { useCliTools } from './use-tools';
import './setup.css';

export function AiCliInventory({ compact = false, settings = false }: { compact?: boolean; settings?: boolean }) {
  useTranslation();
  const { tools, error } = useCliTools();
  const ready = tools.some(tool => tool.consented && tool.tested);
  const summary = error ? tr('ai-cli:inventory_error') : ready
    ? `${cliNames[recommendedProvider(tools)]} · ${tr('ai-cli:ready_title')}` : tr('ai-cli:summary_unconnected');
  const entry = <Button variant={settings ? 'secondary' : 'ghost'} className="ai-cli-inventory-entry" onClick={() => openAiCliSetup()}><Sparkles size={16} aria-hidden="true" /><span>{tr('ai-cli:wizard')}</span></Button>;
  if (settings) return <SettingsGroup title={tr('ai-cli:tools')}>
    <p role="status">{summary}</p>
    <div className="settings-row ai-cli-tool-actions">{entry}</div>
  </SettingsGroup>;
  return <section className="ai-cli-inventory" data-compact={compact} aria-label={tr('ai-cli:tools')}>
    {entry}<p className="ai-cli-summary" role="status">{summary}</p>
  </section>;
}
