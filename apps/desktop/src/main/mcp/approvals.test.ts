/** Every mutation waits for a fresh, exact, main-owned approval and reauthorization. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { ToolName } from '../../shared/mcp';
import { call, fixture, pair, proposal, rpc, taskArgs } from './test-fixture';

const course = randomUUID();
const module = randomUUID();
const writes: [ToolName, Record<string, unknown>][] = [
  ['create_task', taskArgs()],
  ['update_task', {taskId: randomUUID(), changes: {title: 'New title'}}],
  ['create_study_plan_proposal', {plan: {title: 'Plan', timeZone: 'UTC', dailyBudgetMinutes: 30, assumptions: ['Study each day'], blocks: [{title: 'Read', courseId: null, target: null, startsAt: '2026-12-01T00:00:00Z', durationMinutes: 30}]}}],
  ['set_reminder', {target: {kind: 'task', id: randomUUID()}, remindAt: '2026-12-01T00:00:00Z', note: 'Read'}],
  ['export_calendar', {selection: {taskIds: [randomUUID()]}}],
  ['open_in_app', {courseId: course, moduleId: module}],
  ['mark_module_complete', {courseId: course, moduleId: module}],
  ['post_forum_reply', {courseId: course, discussionId: 1, postId: 2, subject: 'Reply', message: 'My own reply'}],
  ['save_assignment_draft', {courseId: course, moduleId: module, assignmentId: 1, text: 'My own work', studentOwned: true}],
];

it.each(writes)('%s requires a new one-shot approval for the exact payload', async (name, args) => {
  const {engine, account, execute, prepare} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const response = call(engine, client.grant, name, args);
  const pending = await proposal(engine);
  expect(pending.tool).toBe(name);
  expect(pending.payload).toMatchObject(args);
  expect(Date.parse(pending.expiresAt) - Date.parse(pending.createdAt)).toBe(60_000);
  expect(execute).not.toHaveBeenCalled();
  expect(Object.isFrozen(prepare.mock.calls[0]?.[1])).toBe(true);
  engine.decideProposal({proposalId: pending.id, approve: true});
  expect(await response).toMatchObject({ok: true});
  expect(execute).toHaveBeenCalledTimes(1);
  expect(() => engine.decideProposal({proposalId: pending.id, approve: true})).toThrow('NOT_FOUND');
  const again = call(engine, client.grant, name, args);
  const second = await proposal(engine);
  expect(second.id).not.toBe(pending.id);
  expect(execute).toHaveBeenCalledTimes(1);
  engine.decideProposal({proposalId: second.id, approve: false});
  expect(await again).toMatchObject({ok: false, error: {code: 'DENIED'}});
  expect(execute).toHaveBeenCalledTimes(1);
});

it.each(['revoke', 'off', 'edit', 'disconnect', 'dispose'] as const)('%s cancels pending writes without executing them', async action => {
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const response = call(engine, client.grant, 'create_task', taskArgs(), 'owner');
  const pending = await proposal(engine);
  if (action === 'revoke') engine.revoke(client.grantInfo.id);
  if (action === 'off') engine.setEnabled(false);
  if (action === 'edit') engine.editGrant({grantId: client.grantInfo.id, scopes: ['read:courses'], accountIds: [account.id], expiresAt: client.grantInfo.expiresAt});
  if (action === 'disconnect') engine.disconnect('owner');
  if (action === 'dispose') engine.dispose();
  expect(await response).toMatchObject({ok: false});
  expect(execute).not.toHaveBeenCalled();
  expect(engine.state().proposals).toEqual([]);
  expect(() => engine.decideProposal({proposalId: pending.id, approve: true})).toThrow();
});

it('expires approval after 60 seconds and expires grants again immediately before execution', async () => {
  vi.useFakeTimers();
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  let response = call(engine, client.grant, 'create_task', taskArgs());
  await vi.advanceTimersByTimeAsync(0);
  expect(engine.state().proposals).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await response).toMatchObject({ok: false, error: {code: 'TIMEOUT'}});
  expect(execute).not.toHaveBeenCalled();
  engine.editGrant({grantId: client.grantInfo.id, scopes: client.grantInfo.scopes, accountIds: [account.id], expiresAt: new Date(Date.now() + 1000).toISOString()});
  response = call(engine, client.grant, 'create_task', taskArgs());
  await vi.advanceTimersByTimeAsync(0);
  const pending = engine.state().proposals[0]!;
  await vi.advanceTimersByTimeAsync(1000);
  engine.decideProposal({proposalId: pending.id, approve: true});
  expect(await response).toMatchObject({ok: false, error: {code: 'EXPIRED'}});
  expect(execute).not.toHaveBeenCalled();
});

it('reauthorizes after approval even when revoke occurs after the decision', async () => {
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const response = call(engine, client.grant, 'create_task', taskArgs());
  const pending = await proposal(engine);
  engine.decideProposal({proposalId: pending.id, approve: true});
  engine.revoke(client.grantInfo.id);
  expect(await response).toMatchObject({ok: false, error: {code: 'DENIED'}});
  expect(execute).not.toHaveBeenCalled();
});

it('does not truncate a 20,000-character submission and rejects payloads that cannot be shown exactly', async () => {
  const {engine, account, execute} = fixture({secretValues: () => ['SCHOOL-CANARY']});
  engine.setEnabled(true);
  const client = await pair(engine, [account.id]);
  const args = {courseId: course, moduleId: module, assignmentId: 1, text: 'word '.repeat(4000), studentOwned: true};
  const response = call(engine, client.grant, 'save_assignment_draft', args);
  expect((await proposal(engine)).payload.text).toBe(args.text);
  engine.decideProposal({proposalId: engine.state().proposals[0]!.id, approve: true});
  expect(await response).toMatchObject({ok: true});
  expect(await call(engine, client.grant, 'save_assignment_draft', {...args, text: 'SCHOOL-CANARY'})).toMatchObject({ok: false, error: {code: 'INVALID_ARGUMENT'}});
  expect(execute).toHaveBeenCalledTimes(1);
});

it('isolates concurrent clients and denies bridge approval attempts', async () => {
  const {engine, account, execute} = fixture();
  engine.setEnabled(true);
  const a = await pair(engine, [account.id]);
  const b = await pair(engine, [account.id]);
  const pending = call(engine, a.grant, 'create_task', taskArgs(), a.connection);
  await proposal(engine);
  expect(await call(engine, b.grant, 'list_courses', {}, b.connection)).toMatchObject({ok: true});
  engine.revoke(a.grantInfo.id);
  expect(await pending).toMatchObject({ok: false, error: {code: 'DENIED'}});
  expect(await rpc(engine, b.connection, 'ping', {})).toMatchObject({result: {enabled: true}});
  expect(execute).toHaveBeenCalledTimes(1);
});
