/** Global consent presents one immutable request at a time and sends each decision at most once. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultScopes, type Pairing, type Proposal } from '../../shared/mcp';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { AgentAccount, AgentDate, AgentSelection, useAgentDeadline } from './agents-fields';
import { useAgents } from './agents-state';
import './agents.css';

function ConsentFrame({ id, expiresAt, pairing, canApprove, approve, deny, dismiss, children }: {
  id: string; expiresAt: string; pairing?: boolean; canApprove: boolean;
  approve: () => void; deny: () => void; dismiss: () => void; children: ReactNode;
}) {
  const agents = useAgents();
  const remaining = useAgentDeadline(expiresAt);
  const attempted = agents.attempted.has(id);
  const unavailable = agents.connection !== 'ready';
  const denyRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const blocked = agents.pending || attempted || !remaining || unavailable || !agents.state?.enabled;
  const reject = () => {
    if (agents.pending) return;
    if (attempted || !remaining || unavailable || !agents.state?.enabled) dismiss();
    else deny();
  };
  return <Dialog open onOpenChange={open => { if (!open) reject(); }}>
    <DialogContent className="agents-dialog agents-consent-dialog" data-testid="agent-consent" data-request-id={id} data-request-kind={pairing ? 'pairing' : 'proposal'} showCloseButton={false} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (agents.pending) event.preventDefault(); }} onOpenAutoFocus={event => {
      event.preventDefault();
      (denyRef.current?.disabled ? closeRef.current : denyRef.current)?.focus();
    }}>
      <DialogTitle>{tr(pairing ? 'agents:pair_title' : 'agents:proposal_title')}</DialogTitle>
      <DialogDescription>{tr(pairing ? 'agents:pair_help' : 'agents:proposal_help')}</DialogDescription>
      <div className="agents-consent-body">{children}</div>
      <p className="agents-countdown" role="timer" aria-live="off">{remaining ? tr('agents:countdown', { seconds: remaining }) : tr('agents:request_expired')}</p>
      <p className="agents-muted">{tr('agents:expiry')} <AgentDate value={expiresAt} /></p>
      {unavailable && <p role="alert">{tr('agents:offline')}</p>}
      {attempted && !agents.pending && <p role="status">{tr('agents:decision_uncertain')}</p>}
      {agents.failed && <p role="alert">{tr('agents:action_error')}</p>}
      <div className="agents-actions">
        {(!remaining || unavailable || attempted) && <Button ref={closeRef} variant="secondary" disabled={agents.pending} onClick={dismiss}>{tr('agents:close')}</Button>}
        <Button ref={denyRef} variant="secondary" disabled={blocked} onClick={deny}>{tr('agents:deny')}</Button>
        <Button disabled={blocked || !canApprove} onClick={approve}>{tr(pairing ? 'agents:pair_approve' : 'agents:approve')}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function PairingConsent({ request, dismiss }: { request: Pairing; dismiss: () => void }) {
  const agents = useAgents();
  const accounts = agents.state?.accounts ?? [];
  const [scopes, setScopes] = useState(() => defaultScopes.filter(scope => request.requestedScopes.includes(scope)));
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [compared, setCompared] = useState(false);
  const disabled = agents.pending || agents.attempted.has(request.id) || agents.connection !== 'ready' || Date.parse(request.expiresAt) <= Date.now();
  const valid = compared && scopes.length > 0 && scopes.every(scope => request.requestedScopes.includes(scope)) && accountIds.length > 0 && accountIds.every(id => accounts.some(account => account.id === id));
  const decide = (approve: boolean) => {
    if (disabled || (approve && !valid)) return;
    void agents.act('mcp:pair-decision', { pairingId: request.id, approve, scopes: approve ? scopes : [], accountIds: approve ? accountIds : [] });
  };
  return <ConsentFrame id={request.id} expiresAt={request.expiresAt} pairing canApprove={valid} approve={() => decide(true)} deny={() => decide(false)} dismiss={dismiss}>
    <div><p className="agents-muted">{tr('agents:claimed_name')}</p><p className="agents-client-name">{request.clientName}</p><p className="agents-muted">{tr('agents:self_reported')}</p></div>
    <div><p>{tr('agents:pair_code')}</p><output className="agents-code" data-testid="agent-pairing-code">{request.code}</output></div>
    <label className="agents-choice"><Checkbox checked={compared} disabled={disabled} onCheckedChange={checked => setCompared(checked === true)} /><span>{tr('agents:code_confirm')}</span></label>
    <AgentSelection availableScopes={request.requestedScopes} scopes={scopes} accountIds={accountIds} accounts={accounts} onScopes={setScopes} onAccounts={setAccountIds} disabled={disabled} />
    <p className="agents-muted">{tr('agents:pair_expiry')}</p>
  </ConsentFrame>;
}

function ProposalConsent({ request, dismiss }: { request: Proposal; dismiss: () => void }) {
  const agents = useAgents();
  const [studentOwned,setStudentOwned]=useState(false);
  const needsOwnership=request.tool==='submit_assignment';
  const decide = (approve: boolean) => void agents.act('mcp:proposal-decision', { proposalId: request.id, approve });
  return <ConsentFrame id={request.id} expiresAt={request.expiresAt} canApprove={!needsOwnership || studentOwned} approve={() => decide(true)} deny={() => decide(false)} dismiss={dismiss}>
    <div><p className="agents-muted">{tr('agents:claimed_name')}</p><p className="agents-client-name">{request.clientName}</p><p className="agents-muted">{tr('agents:self_reported')}</p></div>
    <dl className="agents-details">
      <div><dt>{tr('agents:tool')}</dt><dd><code>{request.tool}</code></dd></div>
      <div><dt>{tr('agents:accounts')}</dt><dd><AgentAccount id={request.accountId} accounts={agents.state?.accounts ?? []} /></dd></div>
      <div><dt>{tr('agents:target')}</dt><dd>{request.target}</dd></div>
      <div><dt>{tr('agents:risk')}</dt><dd className="agents-risk" data-risk={request.risk}>{tr(`agents:risk_${request.risk}`)}</dd></div>
    </dl>
    {request.risk === 'high' && <p className="agents-risk" data-risk="high">{tr('agents:high_risk')}</p>}
    {needsOwnership && <label className="agents-choice"><Checkbox checked={studentOwned} disabled={agents.pending} onCheckedChange={value=>setStudentOwned(value===true)}/><span>{tr('agents:own_work')}</span></label>}
    <section><h3>{tr('agents:payload')}</h3><pre className="agents-raw">{JSON.stringify(request.payload, null, 2)}</pre></section>
  </ConsentFrame>;
}

export function AgentConsent() {
  useTranslation('agents');
  const { state } = useAgents();
  const [activeId, setActiveId] = useState<string>();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const requests = state?.enabled ? [
    ...state.proposals.map(request => ({ kind: 'proposal' as const, request })),
    ...state.pairings.map(request => ({ kind: 'pairing' as const, request })),
  ].filter(item => !dismissed.has(item.request.id)) : [];
  const active = requests.find(item => item.request.id === activeId) ?? requests[0];
  useEffect(() => { setActiveId(active?.request.id); }, [active?.request.id]);
  if (!active) return null;
  const dismiss = () => setDismissed(previous => new Set([...previous, active.request.id]));
  return active.kind === 'pairing'
    ? <PairingConsent key={`${active.request.id}:${active.request.code}:${active.request.requestedScopes.join(',')}`} request={active.request} dismiss={dismiss} />
    : <ProposalConsent key={active.request.id} request={active.request} dismiss={dismiss} />;
}

export function AgentStatus() {
  useTranslation('agents');
  const { state, connection } = useAgents();
  if (!state?.enabled || connection !== 'ready') return null;
  const queued = [...state.pairings, ...state.proposals].filter(request => Date.parse(request.expiresAt) > Date.now()).length;
  if (!state.activeCalls && !queued) return null;
  return <div className="agents-live" role="status" aria-live="polite" data-testid="agent-status">
    <span className="agents-live-dot" aria-hidden="true" />
    <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vstudy:open-settings', { detail: { tab: 'agents' } }))}>
      {state.activeCalls ? tr('agents:acting', { count: state.activeCalls }) : tr('agents:queued', { count: queued })}
    </Button>
  </div>;
}
