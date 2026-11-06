/** Enforce registry scopes, account allowlists, main-only consent, and final output redaction. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  agentAccountSchema, bridgeRequestSchema, MCP_PROTOCOL_VERSION, mcpIpc, mcpTools, provenanceSchema,
  type AgentsState, type BridgeRequest, type BridgeResponse, type Grant, type McpBackend,
  type McpErrorCode, type PreparedMcpCall, type Scope, type ToolArguments, type ToolName, type ToolResult,
} from '../../shared/mcp';
import { ApprovalQueue, PairingQueue } from './approvals';
import { failureCode, McpFailure, publicFailure } from './errors';
import { GrantStore } from './grants';
import { CallLimiter, waitForStart } from './rate-limit';
import { McpRedactor } from './redaction';
import type { McpStatePersistence } from '../../shared/mcp-platform';

export interface McpEngineOptions {
  userData: string;
  backend: McpBackend;
  persistence?:McpStatePersistence;
  secretValues?: () => readonly string[];
  onChange?: () => void;
  now?: () => number;
  limits?: {maxActive?: number; maxPerGrant?: number; spacingMs?: number; jitterMs?: number; callTimeoutMs?: number};
}
interface Operation {id: string; connectionId: string; grantId: string; controller: AbortController}
interface Cursor {grantId: string; key: string; value: string; expires: number}
type EditGrant = z.input<(typeof mcpIpc)['mcp:edit-grant']['request']>;
type PairDecision = z.input<(typeof mcpIpc)['mcp:pair-decision']['request']>;
type ProposalDecision = z.input<(typeof mcpIpc)['mcp:proposal-decision']['request']>;
const accountOptional = new Set<ToolName>(['list_accounts', 'get_planner', 'create_task', 'update_task', 'create_study_plan_proposal', 'set_reminder', 'export_calendar']);
const additionalScopes: Partial<Record<ToolName, readonly Scope[]>> = {search_content: ['read:files']};

function freezePayload<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freezePayload(child); }
  return value;
}

/** Only trusted renderer IPC calls the decision methods. The bridge exposes handleRequest. */
export class McpEngine {
  private readonly store: GrantStore;
  private readonly pairings: PairingQueue;
  private readonly approvals: ApprovalQueue;
  private readonly limiter: CallLimiter;
  private readonly operations = new Set<Operation>();
  private readonly cursors = new Map<string, Cursor>();
  private readonly now: () => number;
  private disposed = false;

  constructor(private readonly options: McpEngineOptions) {
    this.now = options.now ?? Date.now;
    this.store = new GrantStore(options.userData, this.now,options.persistence);
    this.pairings = new PairingQueue(() => this.changed(), this.now);
    this.approvals = new ApprovalQueue(() => this.changed(), this.now);
    this.limiter = new CallLimiter(this.now, options.limits?.spacingMs, options.limits?.jitterMs);
  }

  private changed(): void { this.options.onChange?.(); }
  private redactor(localSecrets: readonly string[] = []): McpRedactor { return new McpRedactor([...(this.options.secretValues?.() ?? []), ...localSecrets]); }
  private exactPayload(args:ToolArguments, token:string):Record<string,unknown> {
    const payload = this.redactor([token]).record(args, 64_000, 20_000, 100);
    if (JSON.stringify(payload) !== JSON.stringify(args)) throw new McpFailure('INVALID_ARGUMENT');
    return payload;
  }
  private requireEnabled(): void {
    if (this.disposed) throw new McpFailure('DISCONNECTED');
    if (!this.store.enabled) throw new McpFailure('DISABLED');
  }
  private accounts() { return z.array(agentAccountSchema).max(100).parse(this.options.backend.accounts()); }
  private checkAccounts(ids: readonly string[]): void {
    const available = new Set(this.accounts().map(account => account.id));
    if (ids.some(id => !available.has(id))) throw new McpFailure('ACCOUNT_REQUIRED');
  }

  state(): AgentsState {
    const redact = this.redactor();
    return {
      enabled: !this.disposed && this.store.enabled,
      grants: this.store.grants.map(grant => ({...grant, clientName: redact.text(grant.clientName, 100)})),
      pairings: this.pairings.list.map(pair => ({...pair, clientName: redact.text(pair.clientName, 100)})),
      proposals: this.approvals.list.map(proposal => ({...proposal, clientName: redact.text(proposal.clientName, 100), target: redact.text(proposal.target, 1000), payload: redact.record(proposal.payload, 64_000, 20_000, 100)})),
      activity: this.store.activity.map(item => ({...item, clientName: redact.text(item.clientName, 100), args: redact.record(item.args)})),
      activeCalls: this.operations.size,
      accounts: this.accounts().map(account => ({...account, school: redact.text(account.school, 200), user: redact.text(account.user, 200)})),
    };
  }

  setEnabled(enabled: boolean): void {
    this.assertLive();
    this.store.setEnabled(z.boolean().parse(enabled));
    if (!enabled) { this.pairings.cancel(); this.cancel({}, 'DISABLED'); }
    this.changed();
  }

  revoke(grantId: string): void {
    this.assertLive();
    mcpIpc['mcp:revoke'].request.parse({grantId});
    this.store.revoke(grantId);
    this.cancel({grantId}, 'DENIED');
    this.changed();
  }

  editGrant(input: EditGrant): void {
    this.assertLive();
    const request = mcpIpc['mcp:edit-grant'].request.parse(input);
    this.checkAccounts(request.accountIds);
    this.store.edit(request.grantId, request.scopes, request.accountIds, request.expiresAt);
    this.cancel({grantId: request.grantId}, 'DENIED');
    this.changed();
  }

  decidePairing(input: PairDecision): void {
    this.requireEnabled();
    const request = mcpIpc['mcp:pair-decision'].request.parse(input);
    this.checkAccounts(request.accountIds);
    this.pairings.decide(request.pairingId, request.approve, {scopes: request.scopes, accountIds: request.accountIds});
  }

  decideProposal(input: ProposalDecision): void {
    this.requireEnabled();
    const request = mcpIpc['mcp:proposal-decision'].request.parse(input);
    this.approvals.decide(request.proposalId, request.approve);
  }

  /** Connection IDs are generated by the bridge, never supplied by the caller. */
  async handleRequest(input: BridgeRequest, connectionId: string): Promise<BridgeResponse> {
    const parsed = bridgeRequestSchema.safeParse(input);
    const id = parsed.success ? parsed.data.id : '';
    try {
      if (!parsed.success) throw new McpFailure('INVALID_ARGUMENT');
      this.assertLive();
      const request = parsed.data;
      if (request.method === 'ping') return {jsonrpc: '2.0', id, result: {version: MCP_PROTOCOL_VERSION, enabled: this.store.enabled}};
      this.requireEnabled();
      if (request.method === 'pair.begin') {
        const params = request.params;
        const pair = this.pairings.begin(connectionId, params.clientId, this.redactor().text(params.clientName, 100) || 'Agent', params.scopes);
        return {jsonrpc: '2.0', id, result: {pairingId: pair.id, code: pair.code, expiresAt: pair.expiresAt}};
      }
      if (request.method === 'pair.finish') {
        const {pairing, consent} = this.pairings.take(connectionId, request.params.pairingId);
        this.checkAccounts(consent.accountIds);
        const prior = this.store.grants.filter(grant => grant.clientId === pairing.clientId);
        const result = this.store.issue(pairing.clientId, pairing.clientName, consent.scopes, consent.accountIds);
        for (const grant of prior) this.cancel({grantId: grant.id}, 'DENIED');
        this.changed();
        return {jsonrpc: '2.0', id, result};
      }
      return {jsonrpc: '2.0', id, result: await this.call(request.params, connectionId)};
    } catch (error) {
      const failure = publicFailure(failureCode(error)).error;
      return {jsonrpc: '2.0', id, error: {code: -32000, message: failure.message, data: {code: failure.code, hint: failure.hint}}};
    }
  }

  private assertLive(): void { if (this.disposed) throw new McpFailure('DISCONNECTED'); }

  private authorize(token: string, name: ToolName, args: ToolArguments, prepared?: PreparedMcpCall): Grant {
    this.requireEnabled();
    const grant = this.store.authorize(token);
    if ([mcpTools[name].scope, ...(additionalScopes[name] ?? [])].some(scope => !grant.scopes.includes(scope))) throw new McpFailure('SCOPE_REQUIRED');
    if (args.account && !grant.accountIds.includes(args.account)) throw new McpFailure('DENIED');
    if (prepared) {
      if (prepared.accountId !== null && !grant.accountIds.includes(prepared.accountId)) throw new McpFailure('DENIED');
      if (args.account && prepared.accountId !== args.account) throw new McpFailure('DENIED');
      if (prepared.accountId === null && !accountOptional.has(name)) throw new McpFailure('ACCOUNT_REQUIRED');
      if (prepared.accountId !== null) this.checkAccounts([prepared.accountId]);
      if (provenanceSchema.parse(prepared.provenance).account !== prepared.accountId) throw new McpFailure('DENIED');
    }
    return grant;
  }

  private async call(params: Extract<BridgeRequest, {method: 'tools.call'}>['params'], connectionId: string): Promise<ToolResult> {
    let accountId: string | null = null;
    try {
      let grant = this.store.authorize(params.grant);
      const parsed = mcpTools[params.name].schema.safeParse(params.args);
      if (!parsed.success) throw new McpFailure('INVALID_ARGUMENT');
      let args = parsed.data;
      grant = this.authorize(params.grant, params.name, args);
      if (!args.account && !accountOptional.has(params.name)) {
        const available = this.accounts().filter(account => grant.accountIds.includes(account.id));
        if (available.length !== 1) throw new McpFailure('ACCOUNT_REQUIRED');
        args = {...args, account: available[0]!.id};
      }
      if (mcpTools[params.name].risk !== 'read') this.exactPayload(args, params.grant);
      const max = this.options.limits?.maxActive ?? 16;
      if (this.operations.size >= max || [...this.operations].filter(item => item.grantId === grant.id).length >= (this.options.limits?.maxPerGrant ?? 4)) throw new McpFailure('RATE_LIMITED');
      const delay = this.limiter.admit(grant.id);
      const operation: Operation = {id: randomUUID(), connectionId, grantId: grant.id, controller: new AbortController()};
      this.operations.add(operation);
      this.changed();
      const result = await this.runOperation(operation, params.name, args, params.grant, delay, prepared => { accountId = prepared.accountId; });
      if (result.ok) {
        const redactor = this.redactor([params.grant]);
        this.store.record(grant.id, {id: randomUUID(), at: new Date(this.now()).toISOString(), clientName: redactor.text(grant.clientName, 100), tool: params.name, accountId, status: 'OK', args: redactor.record(args)});
        this.changed();
      }
      return result;
    } catch (error) {
      return publicFailure(failureCode(error));
    }
  }

  private async runOperation(operation: Operation, name: ToolName, args: ToolArguments, token: string, delay: number, prepared: (call: PreparedMcpCall) => void): Promise<ToolResult> {
    const signal = operation.controller.signal;
    const timer = setTimeout(() => { this.approvals.cancel({operationId: operation.id}, 'TIMEOUT'); operation.controller.abort(new McpFailure('TIMEOUT')); }, this.options.limits?.callTimeoutMs ?? 120_000);
    timer.unref();
    const aborted = new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    const work = (async () => {
      await waitForStart(delay, signal);
      const grant = this.authorize(token, name, args);
      if (name === 'sync_now') this.limiter.admitSync(args.account ?? [...grant.accountIds].sort().join(','));
      const backendArgs = {...args};
      if (args.cursor) {
        const cursor = this.cursors.get(args.cursor);
        if (!cursor || cursor.grantId !== grant.id || cursor.key !== this.cursorKey(name, args) || cursor.expires <= this.now()) throw new McpFailure('INVALID_ARGUMENT');
        backendArgs.cursor = cursor.value;
      }
      const call = await this.options.backend.prepare(name, freezePayload(structuredClone(backendArgs)), Object.freeze([...grant.accountIds]), signal, () => {
        try { signal.throwIfAborted(); this.authorize(token, name, args); return null; }
        catch (error) { return failureCode(error); }
      });
      signal.throwIfAborted();
      this.authorize(token, name, args, call);
      prepared(call);
      const risk = mcpTools[name].risk;
      if (risk !== 'read') {
        const redactor = this.redactor([token]);
        const code = await this.approvals.request(operation.connectionId, operation.id, {grantId: grant.id, clientName: redactor.text(grant.clientName, 100), tool: name, risk, accountId: call.accountId, target: redactor.text(call.target, 1000), payload: {...this.exactPayload(args, token), ...redactor.record(call.approvalContext ?? {}, 32_000)}});
        if (code) throw new McpFailure(code);
        await waitForStart(this.limiter.startDelay(), signal);
      }
      signal.throwIfAborted();
      this.authorize(token, name, args, call);
      const output = await call.execute(signal, () => {
        try { signal.throwIfAborted(); this.authorize(token, name, args, call); if (risk !== 'read') this.exactPayload(args, token); return null; }
        catch (error) { return failureCode(error); }
      });
      signal.throwIfAborted();
      this.authorize(token, name, args, call);
      let cursor: string | null = null;
      if (output.nextCursor) {
        if (typeof output.nextCursor !== 'string' || output.nextCursor.length > 2048) throw new McpFailure('INTERNAL');
        cursor = `mcp:${randomUUID()}`;
        for (const [id, saved] of this.cursors) if (saved.expires <= this.now()) this.cursors.delete(id);
        if (this.cursors.size >= 256) this.cursors.delete(this.cursors.keys().next().value!);
        this.cursors.set(cursor, {grantId: grant.id, key: this.cursorKey(name, args), value: output.nextCursor, expires: this.now() + 15 * 60_000});
      }
      return this.redactor([token]).result(output.content, call.provenance, cursor, risk !== 'read');
    })();
    void work.finally(() => { clearTimeout(timer); this.operations.delete(operation); this.changed(); }).catch(() => {});
    return Promise.race([work, aborted]);
  }

  private cursorKey(name: ToolName, args: ToolArguments): string {
    const {cursor: _cursor, ...query} = args;
    void _cursor;
    return JSON.stringify([name, query]);
  }

  private cancel(filter: {grantId?: string; connectionId?: string}, code: McpErrorCode): void {
    this.approvals.cancel(filter, code);
    if (filter.connectionId === undefined) for (const [id, cursor] of this.cursors) if (filter.grantId === undefined || cursor.grantId === filter.grantId) this.cursors.delete(id);
    for (const operation of this.operations) {
      if (filter.grantId !== undefined && operation.grantId !== filter.grantId) continue;
      if (filter.connectionId !== undefined && operation.connectionId !== filter.connectionId) continue;
      operation.controller.abort(new McpFailure(code));
    }
  }

  disconnect(connectionId: string): void { this.pairings.cancel(connectionId); this.cancel({connectionId}, 'DISCONNECTED'); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pairings.cancel();
    this.cancel({}, 'DISCONNECTED');
  }
}

export function createMcpEngine(options: McpEngineOptions): McpEngine { return new McpEngine(options); }
