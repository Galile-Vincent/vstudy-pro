/** Bound activity writes without delaying durable grant decisions. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { defaultScopes } from '../../shared/mcp';
import { GrantStore } from './grants';
import { countingStatePersistence } from './state-test-fixture';
import { call, fixture, pair, proposal, taskArgs } from './test-fixture';

it('persists successful activity and last use together, updating last use at most once a minute across restart', async () => {
  let now = Date.parse('2026-11-06T00:00:00Z');
  const persistence = countingStatePersistence();
  const {engine, account, root} = fixture({persistence, now:() => now});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const before = persistence.write.mock.calls.length;
  const firstUse = new Date(now).toISOString();
  expect(await call(engine, client.grant, 'list_courses')).toMatchObject({ok:true});
  expect(persistence.write).toHaveBeenCalledTimes(before + 1);
  expect(new GrantStore(root, () => now, persistence).grants[0]?.lastUsedAt).toBe(firstUse);
  now += 59_999;
  expect(await call(engine, client.grant, 'list_courses')).toMatchObject({ok:true});
  expect(persistence.write).toHaveBeenCalledTimes(before + 2);
  expect(engine.state().grants[0]?.lastUsedAt).toBe(firstUse);
  now++;
  const restarted = new GrantStore(root, () => now, persistence);
  const entry = {...engine.state().activity[0]!, id:randomUUID(), at:new Date(now).toISOString()};
  restarted.record(client.grantInfo.id, entry);
  expect(persistence.write).toHaveBeenCalledTimes(before + 3);
  expect(restarted.grants[0]?.lastUsedAt).toBe(entry.at);
  expect(restarted.activity).toHaveLength(3);
});

it('rejects invalid and rate-limited traffic without persisting or evicting successful activity', async () => {
  const persistence = countingStatePersistence();
  const {engine, account, other, prepare} = fixture({persistence});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id], defaultScopes);
  const before = persistence.write.mock.calls.length;
  expect(await call(engine, client.grant, 'get_grades', {courseId:randomUUID()})).toMatchObject({error:{code:'SCOPE_REQUIRED'}});
  expect(await call(engine, client.grant, 'list_courses', {account:other.id})).toMatchObject({error:{code:'DENIED'}});
  expect(await call(engine, client.grant, 'list_courses', {unexpected:true})).toMatchObject({error:{code:'INVALID_ARGUMENT'}});
  expect(prepare).not.toHaveBeenCalled();
  expect(persistence.write).toHaveBeenCalledTimes(before);
  for (let i = 0; i < 30; i++) expect(await call(engine, client.grant, 'list_courses')).toMatchObject({ok:true});
  const writes = persistence.write.mock.calls.length;
  const activity = engine.state().activity;
  for (let i = 0; i < 20; i++) expect(await call(engine, client.grant, 'list_courses')).toMatchObject({error:{code:'RATE_LIMITED'}});
  expect(prepare).toHaveBeenCalledTimes(30);
  expect(persistence.write).toHaveBeenCalledTimes(writes);
  expect(engine.state().activity).toEqual(activity);
});

it('does not persist concurrency rejections or declined approvals', async () => {
  const persistence = countingStatePersistence();
  const {engine, account} = fixture({persistence, limits:{maxPerGrant:1}});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const writing = call(engine, client.grant, 'create_task', taskArgs());
  const pending = await proposal(engine);
  const before = persistence.write.mock.calls.length;
  expect(await call(engine, client.grant, 'list_courses')).toMatchObject({error:{code:'RATE_LIMITED'}});
  engine.decideProposal({proposalId:pending.id, approve:false});
  expect(await writing).toMatchObject({ok:false});
  expect(persistence.write).toHaveBeenCalledTimes(before);
  expect(engine.state().activity).toEqual([]);
});

it('persists enable, issue, edit, revoke and disable before returning', async () => {
  const persistence = countingStatePersistence();
  const {engine, account, root} = fixture({persistence});
  const reload = () => new GrantStore(root, Date.now, persistence);
  engine.setEnabled(true);
  expect(persistence.write).toHaveBeenCalledTimes(1);
  expect(reload().enabled).toBe(true);
  const client = await pair(engine, [account.id]);
  expect(persistence.write).toHaveBeenCalledTimes(2);
  expect(reload().authorize(client.grant).id).toBe(client.grantInfo.id);
  engine.editGrant({grantId:client.grantInfo.id, scopes:['read:files'], accountIds:[], expiresAt:client.grantInfo.expiresAt});
  expect(persistence.write).toHaveBeenCalledTimes(3);
  expect(reload().authorize(client.grant)).toMatchObject({scopes:['read:files'], accountIds:[]});
  engine.revoke(client.grantInfo.id);
  expect(persistence.write).toHaveBeenCalledTimes(4);
  expect(() => reload().authorize(client.grant)).toThrow('DENIED');
  engine.setEnabled(false);
  expect(persistence.write).toHaveBeenCalledTimes(5);
  expect(reload().enabled).toBe(false);
});

it('does not publish security-state changes when synchronous persistence fails', () => {
  const persistence = countingStatePersistence();
  const store = new GrantStore('profile', Date.now, persistence);
  store.setEnabled(true);
  const client = store.issue(randomUUID(), 'Agent', defaultScopes, []);
  const state = persistence.read();
  const changes = [
    () => store.setEnabled(false),
    () => store.issue(randomUUID(), 'Other agent', defaultScopes, []),
    () => store.edit(client.grantInfo.id, [], [], client.grantInfo.expiresAt),
    () => store.revoke(client.grantInfo.id),
  ];
  for (const change of changes) {
    persistence.write.mockImplementationOnce(() => { throw new Error('Disk unavailable'); });
    expect(change).toThrow('INTERNAL');
    expect(persistence.read()).toBe(state);
    expect(store.enabled).toBe(true);
    expect(store.grants).toEqual([client.grantInfo]);
    expect(store.authorize(client.grant)).toEqual(client.grantInfo);
  }
});
