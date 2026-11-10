/** Global consent presents one immutable request at a time and sends each decision at most once. */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultScopes, type Pairing, type Proposal } from '../../shared/mcp';
import { tr } from '../../shared/i18n';
import { Button, CheckboxInput, Dialog, DialogHeader } from '@astryxdesign/core';
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
  const blocked = agents.pending || attempted || !remaining || unavailable || !agents.state?.enabled;
  const reject = () => {
    if (agents.pending) return;
    if (attempted || !remaining || unavailable || !agents.state?.enabled) dismiss();
    else deny();
  };
  return <Dialog isOpen onOpenChange={open => { if (!open) reject(); }} width={640} purpose={agents.pending ? 'required' : 'form'} className="agents-dialog agents-consent-dialog"
    data-testid="agent-consent" data-request-id={id} data-request-kind={pairing ? 'pairing' : 'proposal'}>
      <DialogHeader title={tr(pairing ? 'agents:pair_title' : 'agents:proposal_title')} subtitle={tr(pairing ? 'agents:pair_help' : 'agents:proposal_help')} />
      <div className="agents-consent-body">{children}</div>
      <p className="agents-countdown" role="timer" aria-live="off">{remaining ? tr('agents:countdown', { seconds: remaining }) : tr('agents:request_expired')}</p>
      <p className="agents-muted">{tr('agents:request_expires')} <AgentDate value={expiresAt} /></p>
      {unavailable && <p role="alert">{tr('agents:offline')}</p>}
      {attempted && !agents.pending && <p role="status">{tr('agents:decision_uncertain')}</p>}
      {agents.failed && <p role="alert">{tr('agents:action_error')}</p>}
      <div className="dialog-actions">
        {(!remaining || unavailable || attempted) && <Button label={tr('agents:close')} variant="secondary" data-autofocus isDisabled={agents.pending} onClick={dismiss} />}
        <Button label={tr('agents:deny')} variant="secondary" data-autofocus isDisabled={blocked} onClick={deny} />
        <Button label={tr(pairing ? 'agents:pair_approve' : 'agents:approve')} variant="primary" isDisabled={blocked || !canApprove} onClick={approve} />
      </div>
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
    <div className="agents-choice"><CheckboxInput label={tr('agents:code_confirm')} value={compared} isDisabled={disabled} onChange={setCompared} /></div>
    <AgentSelection availableScopes={request.requestedScopes} scopes={scopes} accountIds={accountIds} accounts={accounts} onScopes={setScopes} onAccounts={setAccountIds} disabled={disabled} />
    <p className="agents-muted">{tr('agents:pair_expiry')}</p>
  </ConsentFrame>;
}

function ProposalConsent({ request, dismiss }: { request: Proposal; dismiss: () => void }) {
  const agents = useAgents();
  const [studentOwned,setStudentOwned]=useState(false);
  const needsOwnership=request.tool==='save_assignment_draft';
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
    {needsOwnership && <div className="agents-choice"><CheckboxInput label={tr('agents:own_work')} value={studentOwned} isDisabled={agents.pending} onChange={setStudentOwned} /></div>}
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
  useEffect(() => {
    const review = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setDismissed(previous => new Set([...previous].filter(value => value !== id)));
      setActiveId(id);
    };
    window.addEventListener('vstudy:review-agent', review);
    return () => window.removeEventListener('vstudy:review-agent', review);
  }, []);
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
    <Button label={state.activeCalls ? tr('agents:acting', { count: state.activeCalls }) : tr('agents:queued', { count: queued })} variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vstudy:open-settings', { detail: { tab: 'agents' } }))} />
  </div>;
}
