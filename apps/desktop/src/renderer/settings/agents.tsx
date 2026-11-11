/** Settings exposes explicit agent access controls and the main-redacted local activity log. */
import { Panel } from '../components/panel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n, tr } from '../../shared/i18n';
import { Button, Card, Switch } from '@astryxdesign/core';
import { SettingRow, ListRow, EmptyState } from '../components/ui';
import { AgentAccount, AgentDate } from './agents-fields';
import { AgentGrants } from './agents-grants';
import { AgentConnect } from './agents-connect';
import { useAgents } from './agents-state';
import './agents.css';

const ACTIVITY_LIMIT = 20;

export function AgentsSettings() {
  useTranslation('agents');
  const agents = useAgents();
  const [connecting, setConnecting] = useState(false);
  const activity = [...(agents.state?.activity ?? [])].sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).slice(0,ACTIVITY_LIMIT);
  const status = (value: string) => {
    const key = `agents:status_${value.toLowerCase()}`;
    return i18n.exists(key) ? tr(key) : tr('agents:unknown_status');
  };
  return <div className="agents-settings" data-testid="agents-settings" aria-busy={agents.pending || agents.connection === 'loading'}>
    <p className="agents-intro agents-muted">{tr('agents:description')}</p>
    {agents.connection === 'loading' && <p role="status">{tr('agents:loading')}</p>}
    {agents.connection === 'offline' && <div role="alert"><p>{tr('agents:offline')}</p><Button label={tr('agents:retry')} variant="secondary" isDisabled={agents.pending} onClick={() => void agents.refresh()} /></div>}
    {agents.state?.unavailable && <p role="alert">{tr('agents:unavailable')}</p>}
    {agents.failed && <p role="alert">{tr('agents:action_error')}</p>}
    <Panel title={tr('agents:master')}><div className="settings-stack settings-general-rows">
      <SettingRow label={tr('agents:master')} description={tr('agents:master_help')}>
        <Switch label={tr('agents:master')} isLabelHidden value={agents.state?.enabled ?? false} isDisabled={agents.pending || agents.connection !== 'ready'} onChange={enabled => void agents.act('mcp:enable', { enabled })} />
      </SettingRow>
    </div></Panel>
    {agents.state && <>
      {!agents.state.enabled && <p className="agents-muted">{tr('agents:disabled')}</p>}
      <div className="agents-connect-entry"><Button label={tr('agents:connect')} variant="secondary" isDisabled={agents.pending || agents.connection !== 'ready'} onClick={() => setConnecting(true)} /></div>
      {agents.state.enabled && <section className="agents-section">
        <h3>{tr('agents:waiting')}</h3>
        <p>{tr('agents:deny_help')}</p>
        {[...agents.state.pairings, ...agents.state.proposals].filter(request => Date.parse(request.expiresAt) > Date.now()).map(request =>
          <ListRow key={request.id} className="flex-wrap" title={request.clientName} actions={<div className="agents-actions">
            <Button label={tr('agents:review')} variant="secondary" size="sm" isDisabled={agents.pending} onClick={() => window.dispatchEvent(new CustomEvent('vstudy:review-agent',{detail:request.id}))} />
            <Button label={tr('agents:deny')} variant="ghost" size="sm" isDisabled={agents.pending || agents.connection !== 'ready' || agents.attempted.has(request.id)} onClick={() => void ('code' in request
              ? agents.act('mcp:pair-decision',{pairingId:request.id,approve:false,scopes:[],accountIds:[]})
              : agents.act('mcp:proposal-decision',{proposalId:request.id,approve:false}))} />
          </div>} />)}
      </section>}
      <AgentGrants />
      <div className="agents-section"><Panel title={<span id="agents-activity-title">{tr('agents:activity')}</span>}><p className="agents-muted">{tr('agents:activity_help')}</p>
        {!activity.length && <EmptyState headingLevel={4} title={tr('agents:no_activity')} />}
        {agents.state.activity.length > ACTIVITY_LIMIT && <p className="agents-muted">{tr('agents:latest_activity',{count:ACTIVITY_LIMIT})}</p>}
        <ol className="agents-activity">{activity.map(item => <li key={item.id}><Card padding={3} className="settings-stack">
          <ListRow className="flex-wrap" title={item.clientName} meta={<AgentDate value={item.at} />} />
          <dl className="agents-details">
            <div><dt>{tr('agents:tool')}</dt><dd><code>{item.tool}</code></dd></div>
            <div><dt>{tr('agents:accounts')}</dt><dd><AgentAccount id={item.accountId} accounts={agents.state!.accounts} /></dd></div>
            <div><dt>{tr('agents:result')}</dt><dd>{status(item.status)}</dd></div>
          </dl>
          <details><summary>{tr('agents:arguments')}</summary><pre className="agents-raw">{JSON.stringify(item.args, null, 2)}</pre></details>
        </Card></li>)}</ol>
      </Panel></div>
    </>}
    {connecting && <AgentConnect onClose={() => setConnecting(false)} />}
  </div>;
}
