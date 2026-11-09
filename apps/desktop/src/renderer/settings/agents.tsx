/** Settings exposes explicit agent access controls and the main-redacted local activity log. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n, tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Card, SettingRow, ListRow, EmptyState } from '../components/ui';
import { AgentAccount, AgentDate } from './agents-fields';
import { AgentGrants } from './agents-grants';
import { AgentConnect } from './agents-connect';
import { useAgents } from './agents-state';
import './agents.css';

export function AgentsSettings() {
  useTranslation('agents');
  const agents = useAgents();
  const [connecting, setConnecting] = useState(false);
  const activity = [...(agents.state?.activity ?? [])].sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).slice(0,20);
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
    <Card variant="flat" className="p-[var(--space-4)]">
      <SettingRow label={tr('agents:master')} description={tr('agents:master_help')}>
        <Switch aria-label={tr('agents:master')} checked={agents.state?.enabled ?? false} disabled={agents.pending || agents.connection !== 'ready'} onCheckedChange={enabled => void agents.act('mcp:enable', { enabled })} />
      </SettingRow>
    </Card>
    {agents.state && <>
      {!agents.state.enabled && <p className="agents-muted">{tr('agents:disabled')}</p>}
      <div className="agents-connect-entry"><Button variant="secondary" disabled={agents.pending || agents.connection !== 'ready'} onClick={() => setConnecting(true)}>{tr('agents:connect')}</Button></div>
      {agents.state.enabled && <section className="agents-section">
        <h3>{tr('agents:waiting')}</h3>
        <p>{tr('agents:deny_help')}</p>
        {[...agents.state.pairings, ...agents.state.proposals].filter(request => Date.parse(request.expiresAt) > Date.now()).map(request =>
          <ListRow key={request.id} className="flex-wrap" title={request.clientName} actions={<div className="agents-actions">
            <Button variant="secondary" disabled={agents.pending} onClick={() => window.dispatchEvent(new CustomEvent('vstudy:review-agent',{detail:request.id}))}>{tr('agents:review')}</Button>
            <Button variant="ghost" disabled={agents.pending || agents.connection !== 'ready' || agents.attempted.has(request.id)} onClick={() => void ('code' in request
              ? agents.act('mcp:pair-decision',{pairingId:request.id,approve:false,scopes:[],accountIds:[]})
              : agents.act('mcp:proposal-decision',{proposalId:request.id,approve:false}))}>{tr('agents:deny')}</Button>
          </div>} />)}
      </section>}
      <AgentGrants />
      <section className="agents-section" aria-labelledby="agents-activity-title">
        <h3 id="agents-activity-title">{tr('agents:activity')}</h3><p className="agents-muted">{tr('agents:activity_help')}</p>
        {!activity.length && <EmptyState headingLevel={4} title={tr('agents:no_activity')} />}
        {agents.state.activity.length >= 20 && <p className="agents-muted">{tr('agents:latest_activity')}</p>}
        <ol className="agents-activity">{activity.map(item => <li key={item.id}><Card variant="flat" className="gap-[var(--space-2)] p-[var(--space-3)]">
          <ListRow className="flex-wrap" title={item.clientName} meta={<AgentDate value={item.at} />} />
          <dl className="agents-details">
            <div><dt>{tr('agents:tool')}</dt><dd><code>{item.tool}</code></dd></div>
            <div><dt>{tr('agents:accounts')}</dt><dd><AgentAccount id={item.accountId} accounts={agents.state!.accounts} /></dd></div>
            <div><dt>{tr('agents:result')}</dt><dd>{status(item.status)}</dd></div>
          </dl>
          <details><summary>{tr('agents:arguments')}</summary><pre className="agents-raw">{JSON.stringify(item.args, null, 2)}</pre></details>
        </Card></li>)}</ol>
      </section>
    </>}
    {connecting && <AgentConnect onClose={() => setConnecting(false)} />}
  </div>;
}
