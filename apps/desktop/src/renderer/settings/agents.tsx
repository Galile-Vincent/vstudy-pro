/** Settings exposes explicit agent access controls and the main-redacted local activity log. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n, tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { SettingsGroup, SettingsRow } from './layout';
import { AgentAccount, AgentDate } from './agents-fields';
import { AgentGrants } from './agents-grants';
import { AgentConnect } from './agents-connect';
import { useAgents } from './agents-state';
import './agents.css';

export function AgentsSettings() {
  useTranslation('agents');
  const agents = useAgents();
  const [connecting, setConnecting] = useState(false);
  const status = (value: string) => {
    const key = `agents:status_${value.toLowerCase()}`;
    return i18n.exists(key) ? tr(key) : tr('agents:unknown_status');
  };
  return <div className="agents-settings" data-testid="agents-settings" aria-busy={agents.pending || agents.connection === 'loading'}>
    <p className="agents-intro agents-muted">{tr('agents:description')}</p>
    {agents.connection === 'loading' && <p role="status">{tr('agents:loading')}</p>}
    {agents.connection === 'offline' && <div role="alert"><p>{tr('agents:offline')}</p><Button variant="secondary" disabled={agents.pending} onClick={() => void agents.refresh()}>{tr('agents:retry')}</Button></div>}
    {agents.state?.unavailable && <p role="alert">{tr('agents:unavailable')}</p>}
    {agents.failed && <p role="alert">{tr('agents:action_error')}</p>}
    <SettingsGroup>
      <SettingsRow label={tr('agents:master')} description={tr('agents:master_help')}>
        <Switch aria-label={tr('agents:master')} checked={agents.state?.enabled ?? false} disabled={agents.pending || agents.connection !== 'ready'} onCheckedChange={enabled => void agents.act('mcp:enable', { enabled })} />
      </SettingsRow>
    </SettingsGroup>
    {agents.state && <>
      {!agents.state.enabled && <p className="agents-muted">{tr('agents:disabled')}</p>}
      <div className="agents-connect-entry"><Button variant="secondary" disabled={agents.pending || agents.connection !== 'ready'} onClick={() => setConnecting(true)}>{tr('agents:connect')}</Button></div>
      <AgentGrants />
      <section className="agents-section" aria-labelledby="agents-activity-title">
        <h3 id="agents-activity-title">{tr('agents:activity')}</h3><p className="agents-muted">{tr('agents:activity_help')}</p>
        {!agents.state.activity.length && <p>{tr('agents:no_activity')}</p>}
        <ol className="agents-activity">{agents.state.activity.map(item => <li className="agents-card" key={item.id}>
          <header className="agents-card-header"><strong>{item.clientName}</strong><AgentDate value={item.at} /></header>
          <dl className="agents-details">
            <div><dt>{tr('agents:tool')}</dt><dd><code>{item.tool}</code></dd></div>
            <div><dt>{tr('agents:accounts')}</dt><dd><AgentAccount id={item.accountId} accounts={agents.state!.accounts} /></dd></div>
            <div><dt>{tr('agents:result')}</dt><dd>{status(item.status)}</dd></div>
          </dl>
          <details><summary>{tr('agents:arguments')}</summary><pre className="agents-raw">{JSON.stringify(item.args, null, 2)}</pre></details>
        </li>)}</ol>
      </section>
    </>}
    {connecting && <AgentConnect onClose={() => setConnecting(false)} />}
  </div>;
}
