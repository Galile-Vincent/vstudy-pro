/** Main-owned consent records are socket-bound or exact one-shot 60-second proposals. @packageDocumentation */
import { randomBytes, randomUUID } from 'node:crypto';
import type { McpErrorCode, Pairing, Proposal, Scope, ToolName } from '../../shared/mcp';
import { McpFailure } from './errors';

const PAIRING_MS = 120_000;
export const APPROVAL_MS = 60_000;
type Consent = {scopes: Scope[]; accountIds: string[]};
type PairDecision = {kind: 'waiting'} | {kind: 'denied'} | {kind: 'approved'; consent: Consent};
interface PendingPair {pairing: Pairing; connectionId: string; decision: PairDecision; timer: NodeJS.Timeout}

/** The comparison code is public. Only the originating socket can consume consent. */
export class PairingQueue {
  private readonly pending = new Map<string, PendingPair>();
  constructor(private readonly changed: () => void, private readonly now = Date.now, private readonly maximum = 16) {}
  get list(): Pairing[] { return [...this.pending.values()].filter(item => item.decision.kind === 'waiting').map(item => structuredClone(item.pairing)); }

  begin(connectionId: string, clientId: string, clientName: string, scopes: Scope[]): Pairing {
    if (this.pending.size >= this.maximum || [...this.pending.values()].some(item => item.connectionId === connectionId)) throw new McpFailure('RATE_LIMITED');
    const pairing: Pairing = {id: randomUUID(), clientId, clientName, requestedScopes: [...new Set(scopes)], code: randomBytes(4).toString('hex').toUpperCase(), expiresAt: new Date(this.now() + PAIRING_MS).toISOString()};
    const timer = setTimeout(() => { this.pending.delete(pairing.id); this.changed(); }, PAIRING_MS);
    timer.unref();
    this.pending.set(pairing.id, {pairing, connectionId, decision: {kind: 'waiting'}, timer});
    this.changed();
    return structuredClone(pairing);
  }

  decide(pairingId: string, approve: boolean, consent: Consent): void {
    const pending = this.pending.get(pairingId);
    if (!pending || pending.decision.kind !== 'waiting') throw new McpFailure('NOT_FOUND');
    if (Date.parse(pending.pairing.expiresAt) <= this.now()) throw new McpFailure('EXPIRED');
    if (consent.scopes.some(scope => !pending.pairing.requestedScopes.includes(scope))) throw new McpFailure('SCOPE_REQUIRED');
    pending.decision = approve ? {kind: 'approved', consent: structuredClone(consent)} : {kind: 'denied'};
    this.changed();
  }

  take(connectionId: string, pairingId: string): {pairing: Pairing; consent: Consent} {
    const pending = this.pending.get(pairingId);
    if (!pending || pending.connectionId !== connectionId) throw new McpFailure('DENIED');
    if (Date.parse(pending.pairing.expiresAt) <= this.now()) throw new McpFailure('EXPIRED');
    if (pending.decision.kind !== 'approved') throw new McpFailure('DENIED');
    clearTimeout(pending.timer);
    this.pending.delete(pairingId);
    this.changed();
    return {pairing: pending.pairing, consent: pending.decision.consent};
  }

  cancel(connectionId?: string): void {
    for (const [id, item] of this.pending) {
      if (connectionId !== undefined && item.connectionId !== connectionId) continue;
      clearTimeout(item.timer);
      this.pending.delete(id);
    }
    this.changed();
  }
}

interface PendingApproval {
  proposal: Proposal;
  connectionId: string;
  operationId: string;
  resolve: (code: McpErrorCode | null) => void;
  timer: NodeJS.Timeout;
}
type ApprovalInput = Pick<Proposal, 'grantId' | 'clientName' | 'risk' | 'accountId' | 'target' | 'payload'> & {tool: ToolName};

/** Each decision removes its callback before resolving, so approval cannot be replayed. */
export class ApprovalQueue {
  private readonly pending = new Map<string, PendingApproval>();
  constructor(private readonly changed: () => void, private readonly now = Date.now, private readonly maximum = 16) {}
  get list(): Proposal[] { return [...this.pending.values()].map(item => structuredClone(item.proposal)); }

  request(connectionId: string, operationId: string, input: ApprovalInput): Promise<McpErrorCode | null> {
    if (this.pending.size >= this.maximum || [...this.pending.values()].filter(item => item.proposal.grantId === input.grantId).length >= 4) throw new McpFailure('RATE_LIMITED');
    const now = this.now();
    const proposal: Proposal = {...structuredClone(input), id: randomUUID(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + APPROVAL_MS).toISOString()};
    const promise = new Promise<McpErrorCode | null>(resolve => {
      const timer = setTimeout(() => this.finish(proposal.id, 'TIMEOUT'), APPROVAL_MS);
      timer.unref();
      this.pending.set(proposal.id, {proposal, connectionId, operationId, resolve, timer});
    });
    this.changed();
    return promise;
  }

  decide(proposalId: string, approve: boolean): void {
    const pending = this.pending.get(proposalId);
    if (!pending) throw new McpFailure('NOT_FOUND');
    this.finish(proposalId, Date.parse(pending.proposal.expiresAt) <= this.now() ? 'TIMEOUT' : approve ? null : 'DENIED');
  }

  private finish(id: string, code: McpErrorCode | null): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(code);
    this.changed();
  }

  cancel(filter: {grantId?: string; connectionId?: string; operationId?: string}, code: McpErrorCode): void {
    for (const [id, item] of this.pending) {
      if (filter.operationId !== undefined && item.operationId !== filter.operationId) continue;
      if (filter.grantId !== undefined && item.proposal.grantId !== filter.grantId) continue;
      if (filter.connectionId !== undefined && item.connectionId !== filter.connectionId) continue;
      this.finish(id, code);
    }
  }
}
