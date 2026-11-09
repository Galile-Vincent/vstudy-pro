/** Grant controls keep account selection explicit and never expose local bearer credentials. */
import { useState } from 'react';
import { scopeSchema, type Grant } from '../../shared/mcp';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { AgentAccount, AgentDate, AgentSelection } from './agents-fields';
import { useAgents } from './agents-state';

function localDateTime(instant: string) {
  const date = new Date(instant);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function GrantEditor({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const agents = useAgents();
  const accounts = agents.state?.accounts ?? [];
  const [scopes, setScopes] = useState(grant.scopes);
  const [accountIds, setAccountIds] = useState(grant.accountIds.filter(id => accounts.some(a => a.id === id)));
  const [expiry, setExpiry] = useState(() => localDateTime(grant.expiresAt));
  const expires = new Date(expiry).getTime();
  const validExpiry = Number.isFinite(expires) && expires > Date.now();
  const disabled = agents.pending || agents.connection !== 'ready' || !!grant.revokedAt;
  const validSelection = scopes.length > 0 && accountIds.length > 0 && accountIds.every(id => accounts.some(a => a.id === id));
  const save = async () => {
    if (disabled || !validExpiry || expires <= Date.now() || !validSelection) return;
    if (await agents.act('mcp:edit-grant', { grantId: grant.id, scopes, accountIds, expiresAt: new Date(expiry).toISOString() })) onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open && !agents.pending) onClose(); }}>
    <DialogContent className="agents-dialog" showCloseButton={false} onEscapeKeyDown={event => { if (agents.pending) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>{tr('agents:edit_title')}</DialogTitle>
      <DialogDescription>{tr('agents:edit_help')}</DialogDescription>
      <p className="agents-client-name">{grant.clientName}</p>
      <p className="agents-muted">{tr('agents:self_reported')}</p>
      <AgentSelection availableScopes={scopeSchema.options} scopes={scopes} accountIds={accountIds} accounts={accounts} onScopes={setScopes} onAccounts={setAccountIds} disabled={disabled} />
      <label className="agents-expiry">{tr('agents:expiry')}<Input type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} disabled={disabled} aria-invalid={!validExpiry} /></label>
      {!validExpiry && <p role="alert">{tr('agents:future_expiry')}</p>}
      {agents.failed && <p role="alert">{tr('agents:action_error')}</p>}
      <div className="agents-actions"><Button variant="secondary" disabled={agents.pending} onClick={onClose}>{tr('agents:cancel')}</Button><Button disabled={disabled || !validExpiry || !validSelection} onClick={() => void save()}>{tr('agents:save')}</Button></div>
    </DialogContent>
  </Dialog>;
}

export function AgentGrants() {
  const agents = useAgents();
  const [messages,setMessages] = useState<Record<string,string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const grants = agents.state?.grants ?? [];
  const grant = grants.find(grant => grant.id === editing);
  return <section aria-labelledby="agents-grants-title" className="agents-section">
    <h3 id="agents-grants-title">{tr('agents:grants')}</h3>
    {!grants.length && <p className="agents-muted">{tr('agents:no_grants')}</p>}
    {grants.map(grant => <article className="agents-card" data-grant-id={grant.id} key={grant.id}>
      <header className="agents-card-header"><h4>{grant.clientName}</h4><span className="agents-badge">{tr(`agents:${grant.revokedAt ? 'revoked' : Date.parse(grant.expiresAt) <= Date.now() ? 'expired' : 'active'}`)}</span>{!grant.revokedAt && <div className="agents-actions">
        <Button aria-label={tr('agents:client_action',{action:tr('agents:edit'),name:grant.clientName})} size="sm" variant="secondary" disabled={agents.pending || agents.connection !== 'ready'} onClick={() => setEditing(grant.id)}>{tr('agents:edit')}</Button>
        <Button aria-label={tr('agents:client_action',{action:tr('agents:revoke'),name:grant.clientName})} size="sm" variant="ghost" className="agents-danger" disabled={agents.pending || agents.connection !== 'ready'} onClick={() => void agents.act('mcp:revoke', { grantId: grant.id }).then(ok => {if (ok) setMessages(previous => ({...previous,[grant.id]:tr('agents:revoke_done',{name:grant.clientName})}));})}>{tr('agents:revoke')}</Button>
      </div>}{messages[grant.id] && <span role="status">{messages[grant.id]}</span>}</header>
      <dl className="agents-details">
        <div><dt>{tr('agents:client_id')}</dt><dd><code>{grant.clientId}</code></dd></div>
        <div><dt>{tr('agents:scopes')}</dt><dd className="agents-scopes">{grant.scopes.map(scope => <span className="agents-scope" key={scope} title={scope}>{tr(`agents:scope_${scope.replace(':', '_')}`)}</span>)}</dd></div>
        <div><dt>{tr('agents:accounts')}</dt><dd>{grant.accountIds.map(id => <AgentAccount id={id} accounts={agents.state?.accounts ?? []} key={id} />)}</dd></div>
        <div><dt>{tr('agents:created')}</dt><dd><AgentDate value={grant.createdAt} /></dd></div>
        <div><dt>{tr('agents:last_used')}</dt><dd><AgentDate value={grant.lastUsedAt} /></dd></div>
        <div><dt>{tr('agents:expiry')}</dt><dd><AgentDate value={grant.expiresAt} /></dd></div>
      </dl>
    </article>)}
    {grant && <GrantEditor key={grant.id} grant={grant} onClose={() => setEditing(null)} />}
  </section>;
}
