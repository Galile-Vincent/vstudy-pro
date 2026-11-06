/** Main-only fixtures exercise the public engine with a credential-bearing mock backend. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, vi } from 'vitest';
import { bridgeRequestSchema, pairBeginResultSchema, pairFinishResultSchema, scopeSchema, toolResultSchema, type BridgeRequest, type McpBackend, type Scope, type ToolName } from '../../shared/mcp';
import { McpEngine, type McpEngineOptions } from './engine';
import { testStatePersistence } from './state-test-fixture';

const fixtures: {root: string; engine: McpEngine}[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) { fixture.engine.dispose(); rmSync(fixture.root, {recursive: true, force: true}); } vi.useRealTimers(); vi.restoreAllMocks(); });

export function fixture(options: Partial<Omit<McpEngineOptions, 'userData' | 'backend'>> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vmp-'));
  const account = {id: randomUUID(), school: 'Example university', user: 'Student'};
  const other = {id: randomUUID(), school: 'Other school', user: 'Student'};
  const accounts = [account];
  const execute = vi.fn(async (): Promise<{content: unknown; nextCursor?: string | null}> => ({content: {title: 'Course'}}));
  const prepare = vi.fn<McpBackend['prepare']>(async (_name, args, ids) => {
    const accountId = args.account ?? ids[0] ?? null;
    return {accountId, target: 'Example course', provenance: {account: accountId, school: account.school, courseId: null, moduleId: null, author: null, syncedAt: null}, execute};
  });
  const backend: McpBackend = {accounts: () => accounts, prepare};
  const persistence=options.persistence ?? testStatePersistence(root);
  const engine = new McpEngine({userData: root, backend, ...options,...(persistence?{persistence}:{}), limits: {spacingMs: 0, jitterMs: 0, ...options.limits}});
  fixtures.push({root, engine});
  return {root, engine, backend, persistence, account, other, accounts, execute, prepare};
}

export function rpc(engine: McpEngine, connection: string, method: BridgeRequest['method'], params: unknown) {
  return engine.handleRequest(bridgeRequestSchema.parse({jsonrpc: '2.0', id: randomUUID(), method, params}), connection);
}

export async function pair(engine: McpEngine, accountIds: string[], scopes: Scope[] = [...scopeSchema.options], connection = randomUUID(), clientId = randomUUID()) {
  const begin = await rpc(engine, connection, 'pair.begin', {clientId, clientName: 'Test agent', scopes});
  const pending = pairBeginResultSchema.parse(begin.result);
  engine.decidePairing({pairingId: pending.pairingId, approve: true, scopes, accountIds});
  const finish = await rpc(engine, connection, 'pair.finish', {pairingId: pending.pairingId});
  return {...pairFinishResultSchema.parse(finish.result), connection, clientId};
}

export async function call(engine: McpEngine, token: string, name: ToolName, args: Record<string, unknown> = {}, connection = 'connection') {
  const response = await rpc(engine, connection, 'tools.call', {grant: token, name, args});
  return toolResultSchema.parse(response.result);
}

export async function proposal(engine: McpEngine) {
  await vi.waitFor(() => expect(engine.state().proposals).toHaveLength(1));
  return engine.state().proposals[0]!;
}

export const taskArgs = () => ({task: {title: 'Read chapter 1', courseId: null, dueAt: null, estimateMinutes: 30}});
