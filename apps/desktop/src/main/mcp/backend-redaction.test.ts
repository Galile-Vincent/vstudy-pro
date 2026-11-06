/** Cached reads must scrub school secrets before any live Moodle request loads a client. @packageDocumentation */
import { afterEach, expect, it, vi } from 'vitest';
import { createMcpBackend } from './backend';
import { createMcpEngine } from './engine';
import { defaultScopes, pairBeginResultSchema, pairFinishResultSchema, toolResultSchema } from '../../shared/mcp';
import { randomUUID } from 'node:crypto';
import { backendHarness, accountA, accountB, courseA } from './backend-test-support';
import { moodleSecretId } from '../services/secrets';

const harnesses: Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const harness of harnesses.splice(0)) await harness.close(); });

it('redacts all stored school token forms from the first cached read while the session is expired', async () => {
  const h = await backendHarness();
  harnesses.push(h);
  const secrets = ['WS-Q7a', 'PR-Z8b', 'UA-L9c', 'OT-J0d'];
  h.secrets.useInSession(moodleSecretId(accountA), JSON.stringify({token: secrets[0], privateToken: secrets[1], userPrivateAccessKey: secrets[2]}));
  h.secrets.useInSession(moodleSecretId(accountB), secrets[3]!);
  h.repository.saveCourse({...h.repository.course(courseA).course, fullName: 'Algorithms ' + secrets.join(' ')});
  h.repository.expired(accountA);
  const backend = createMcpBackend(h.options);
  let state: string | undefined;
  const engine = createMcpEngine({userData: '.', backend, secretValues: backend.secretValues, persistence: {read: () => state, write: (_path, text) => { state = text; }}, limits: {spacingMs: 0, jitterMs: 0}});
  try {
    engine.setEnabled(true);
    const begin = await engine.handleRequest({jsonrpc: '2.0', id: 'pair', method: 'pair.begin', params: {clientId: randomUUID(), clientName: 'Test client', scopes: defaultScopes}}, 'connection');
    const pending = pairBeginResultSchema.parse(begin.result);
    engine.decidePairing({pairingId: pending.pairingId, approve: true, scopes: defaultScopes, accountIds: [accountA]});
    const finish = await engine.handleRequest({jsonrpc: '2.0', id: 'finish', method: 'pair.finish', params: {pairingId: pending.pairingId}}, 'connection');
    const {grant} = pairFinishResultSchema.parse(finish.result);
    const response = await engine.handleRequest({jsonrpc: '2.0', id: 'read', method: 'tools.call', params: {grant, name: 'list_courses', args: {}}}, 'connection');
    const result = toolResultSchema.parse(response.result);
    expect(result).toMatchObject({ok: true});
    expect(JSON.stringify(result)).toContain('Algorithms');
    for (const secret of secrets) expect(JSON.stringify(result)).not.toContain(secret);
    expect(h.request).not.toHaveBeenCalled();
    vi.spyOn(h.moodle, 'mcpSecretValues').mockRejectedValueOnce(new Error('Private Keychain WS-Q7a'));
    const denied = await engine.handleRequest({jsonrpc: '2.0', id: 'locked', method: 'tools.call', params: {grant, name: 'list_courses', args: {}}}, 'connection');
    expect(toolResultSchema.parse(denied.result)).toMatchObject({ok: false, error: {code: 'INTERNAL'}});
    expect(JSON.stringify(denied)).not.toContain('WS-Q7a');
  } finally { engine.dispose(); }
});
