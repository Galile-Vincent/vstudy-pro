/** Rate and lifetime limits hold through the public engine under concurrent callers. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { defaultScopes } from '../../shared/mcp';
import { call, fixture, pair, proposal, rpc, taskArgs } from './test-fixture';

it('limits a grant across sockets and resets the request window after a minute', async () => {
  vi.useFakeTimers();
  const {engine, account} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  for (let i = 0; i < 30; i++) expect(await call(engine, client.grant, 'list_courses', {}, `socket${i}`)).toMatchObject({ok: true});
  expect(await call(engine, client.grant, 'list_courses', {}, 'new-socket')).toMatchObject({ok: false, error: {code: 'RATE_LIMITED'}});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await call(engine, client.grant, 'list_courses')).toMatchObject({ok: true});
});

it('bounds pending calls per grant without blocking another client', async () => {
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const a = await pair(engine, [account.id]);
  const b = await pair(engine, [account.id]);
  const calls = Array.from({length: 4}, () => call(engine, a.grant, 'create_task', taskArgs()));
  await vi.waitFor(() => expect(engine.state().proposals).toHaveLength(4));
  expect(await call(engine, a.grant, 'list_courses')).toMatchObject({ok: false, error: {code: 'RATE_LIMITED'}});
  expect(await call(engine, b.grant, 'list_courses')).toMatchObject({ok: true});
  engine.revoke(a.grantInfo.id);
  expect((await Promise.all(calls)).every(result => !result.ok)).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('spaces backend starts with jitter and cancels queued calls before preparation', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const {engine, account, prepare} = fixture({limits: {spacingMs: 100, jitterMs: 100}});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const first = call(engine, client.grant, 'list_courses');
  const second = call(engine, client.grant, 'list_courses');
  await vi.advanceTimersByTimeAsync(0);
  expect(await first).toMatchObject({ok: true});
  expect(prepare).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(149);
  expect(prepare).toHaveBeenCalledTimes(1);
  engine.revoke(client.grantInfo.id);
  expect(await second).toMatchObject({ok: false, error: {code: 'DENIED'}});
  await vi.advanceTimersByTimeAsync(1000);
  expect(prepare).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

it('applies the sync cooldown across independently paired clients', async () => {
  vi.useFakeTimers();
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const a = await pair(engine, [account.id]);
  const b = await pair(engine, [account.id]);
  expect(await call(engine, a.grant, 'sync_now')).toMatchObject({ok: true});
  expect(await call(engine, b.grant, 'sync_now')).toMatchObject({ok: false, error: {code: 'RATE_LIMITED'}});
  expect(execute).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await call(engine, b.grant, 'sync_now')).toMatchObject({ok: true});
});

it('times out a stalled prepare and prevents its later callback from executing', async () => {
  vi.useFakeTimers();
  const {engine, account, prepare, execute} = fixture({limits: {callTimeoutMs: 1000}});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  let finish!: () => void;
  prepare.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return {accountId: account.id, target: 'Course', provenance: {account: account.id, school: 'Example', courseId: null, moduleId: null, author: null, syncedAt: null}, execute}; });
  const response = call(engine, client.grant, 'list_courses');
  await vi.advanceTimersByTimeAsync(1000);
  expect(await response).toMatchObject({ok: false, error: {code: 'TIMEOUT'}});
  expect(engine.state().activeCalls).toBe(1);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute).not.toHaveBeenCalled();
  expect(engine.state().activeCalls).toBe(0);
});

it('discards in-flight results on revoke and never retains the raw bearer even when echoed in data or arguments', async () => {
  const {engine, account, execute, root} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  execute.mockResolvedValueOnce({content: {body: client.grant}});
  const result = await call(engine, client.grant, 'search_content', {query: client.grant});
  expect(JSON.stringify(result)).not.toContain(client.grant);
  expect(JSON.stringify(engine.state())).not.toContain(client.grant);
  const {readFileSync} = await import('node:fs');
  const {join} = await import('node:path');
  expect(readFileSync(join(root, 'mcp/state.json'), 'utf8')).not.toContain(client.grant);
  let finish!: (value: {content: unknown}) => void;
  execute.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const response = call(engine, client.grant, 'list_courses');
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  engine.revoke(client.grantInfo.id);
  expect(await response).toMatchObject({ok: false, error: {code: 'DENIED'}});
  finish({content: 'hidden result'});
});

it('expires unfinished pairing and cannot carry approved consent through master-off', async () => {
  vi.useFakeTimers();
  const {engine, account} = fixture();
  engine.setEnabled(true);
  const begin = await rpc(engine, 'a', 'pair.begin', {clientId: randomUUID(), clientName: 'Agent', scopes: defaultScopes});
  const id = engine.state().pairings[0]!.id;
  expect(begin).toMatchObject({result: {pairingId: id}});
  await vi.advanceTimersByTimeAsync(120_000);
  expect(engine.state().pairings).toEqual([]);
  expect(await rpc(engine, 'a', 'pair.finish', {pairingId: id})).toMatchObject({error: {data: {code: 'DENIED'}}});
  await rpc(engine, 'a', 'pair.begin', {clientId: randomUUID(), clientName: 'Agent', scopes: defaultScopes});
  const fresh = engine.state().pairings[0]!.id;
  engine.decidePairing({pairingId: fresh, approve: true, scopes: defaultScopes, accountIds: [account.id]});
  engine.setEnabled(false);
  engine.setEnabled(true);
  expect(await rpc(engine, 'a', 'pair.finish', {pairingId: fresh})).toMatchObject({error: {data: {code: 'DENIED'}}});
});

it('does not return a raw authentication exception from prepare or execute', async () => {
  const {engine, account, prepare, execute} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  prepare.mockRejectedValueOnce({kind: 'auth', message: 'TOKEN-CANARY', errorcode: 'invalidtoken'});
  expect(await call(engine, client.grant, 'list_courses')).toMatchObject({ok: false, error: {code: 'SESSION_REQUIRED'}});
  execute.mockRejectedValueOnce(new Error('TOKEN-CANARY'));
  const response = call(engine, client.grant, 'create_task', taskArgs());
  engine.decideProposal({proposalId: (await proposal(engine)).id, approve: true});
  const result = await response;
  expect(result).toMatchObject({ok: false, error: {code: 'INTERNAL'}});
  expect(JSON.stringify(result)).not.toContain('TOKEN-CANARY');
});
