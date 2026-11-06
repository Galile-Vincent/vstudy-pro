/** Explain account requirements without storing prices or implying that installing buys service access. */
import { useState } from 'react';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { cliNames, cliProviders } from './model';

const plans = {
  claude: 'https://claude.com/pricing',
  codex: 'https://chatgpt.com/codex/pricing/',
  agy: 'https://antigravity.google/pricing',
};
export function ProviderChoice() {
  const [error, setError] = useState(false);
  return <details className="ai-cli-help"><summary>{tr('ai-cli:which_tool')}</summary>
    <p>{tr('ai-cli:which_tool_help')}</p>
    <ul>{cliProviders.map(provider => <li key={provider}><strong>{cliNames[provider]}</strong>
      <p>{tr(`ai-cli:cost_${provider}`)}</p>
      <Button variant="link" onClick={() => void desktop.invoke('shell:openExternal', { url: plans[provider] }).catch(() => setError(true))}>{tr('ai-cli:current_plans', { provider: cliNames[provider] })}</Button>
    </li>)}</ul>
    {error && <p role="alert">{tr('ai-cli:link_error')}</p>}
  </details>;
}
