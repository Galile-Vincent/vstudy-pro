/** Regression attacks exercise redaction and dispatch authorization through the real engine and backend. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMcpBackend } from './backend';
import { createMcpEngine, type McpEngine } from './engine';
import { mcpTools, pairBeginResultSchema, pairFinishResultSchema, toolResultSchema, type ToolName } from '../../shared/mcp';
import { backendHarness, accountA, courseA, fileA, moduleA, assignA } from './backend-test-support';
import { moodleSecretId } from '../services/secrets';
import fixture from '../moodle/fixtures/mcp-4x.json';
import type { MoodleScheduler } from '../moodle/scheduler';

const harnesses: Awaited<ReturnType<typeof backendHarness>>[] = [];
const engines: McpEngine[] = [];
afterEach(async () => { for (const engine of engines.splice(0)) engine.dispose(); for (const h of harnesses.splice(0)) await h.close(); });
async function setup(secret: string) {
  const h = await backendHarness(); harnesses.push(h);
  h.secrets.useInSession(moodleSecretId(accountA), secret);
  const backend = createMcpBackend(h.options);
  let stored: string | undefined;
  const engine = createMcpEngine({userData: '.', backend, secretValues: backend.secretValues, persistence: {read: () => stored, write: (_path, value) => { stored = value; }}, limits: {spacingMs: 0, jitterMs: 0}});
  engines.push(engine); engine.setEnabled(true);
  const scopes = [...new Set(Object.values(mcpTools).map(tool => tool.scope))];
  const begun = await engine.handleRequest({jsonrpc: '2.0', id: 'begin', method: 'pair.begin', params: {clientId: randomUUID(), clientName: 'Security fixture', scopes}}, 'fixture');
  const pairing = pairBeginResultSchema.parse(begun.result);
  engine.decidePairing({pairingId: pairing.pairingId, approve: true, scopes, accountIds: [accountA]});
  const finished = await engine.handleRequest({jsonrpc: '2.0', id: 'finish', method: 'pair.finish', params: {pairingId: pairing.pairingId}}, 'fixture');
  const client = pairFinishResultSchema.parse(finished.result);
  const call = async (name: ToolName, args: Record<string, unknown>) => toolResultSchema.parse((await engine.handleRequest({jsonrpc: '2.0', id: randomUUID(), method: 'tools.call', params: {grant: client.grant, name, args}}, 'fixture')).result);
  return {...h, backend, engine, client, call};
}

it.each(['0123456789abcdeffedcba9876543210', 'WS-Q7a'])('redacts complete source text before page and search boundaries for %s', async secret => {
  const h = await setup(secret); h.document(fileA, ' '.repeat(997) + secret + ' rest');
  const source = ' '.repeat(997) + secret + ' safe'.repeat(300);
  h.read.mockResolvedValue(source);
  const detail = h.repository.course(courseA);
  h.repository.saveDetail(courseA, {sections: detail.sections.map(section => ({...section, modules: section.modules.map(module => module.id === moduleA ? {...module, descriptionHtml: source} : module)}))});
  for (const name of ['read_file', 'get_module'] as const) {
    let cursor: string | undefined;
    let joined = '';
    do {
      const result = await h.call(name, {...(name === 'read_file' ? {fileId: fileA} : {courseId: courseA, moduleId: moduleA}), limit: 1, ...(cursor ? {cursor} : {})});
      if (!result.ok) throw new Error(result.error.code);
      joined += z.object({text: z.string()}).parse(result.data.content).text;
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(joined).toContain('[redacted]');
    expect(joined).not.toContain(secret);
  }
  const search = await h.call('search_content', {query: secret.slice(0, 4)});
  if (!search.ok) throw new Error(search.error.code);
  expect(search.data.content).toEqual({items: []});
  expect(h.request).not.toHaveBeenCalled();
});

it('rejects a first write whose exact payload changes after stored secrets load', async () => {
  const h = await setup('WS-Q7a');
  expect(h.backend.secretValues()).toEqual([]);
  const result = await h.call('create_task', {task: {title: 'Study WS-Q7a', courseId: courseA, dueAt: null, estimateMinutes: 30}});
  expect(result).toMatchObject({ok: false, error: {code: 'INVALID_ARGUMENT'}});
  expect(h.engine.state().proposals).toEqual([]);
  expect(h.planner.snapshot().tasks).toEqual([]);
  expect(h.request).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(h.engine.state().activeCalls).toBe(0));
});

async function proposal(engine:McpEngine) {
  return vi.waitFor(() => { const value = engine.state().proposals[0]; expect(value).toBeDefined(); return value!; });
}

it('rejects an approved payload when a newly loaded secret would change its text', async () => {
  const h = await setup('initial-secret');
  const running = h.call('create_task', {task: {title: 'Study WS-Q7a', courseId: courseA, dueAt: null, estimateMinutes: 30}});
  const pending = await proposal(h.engine);
  h.secrets.useInSession(moodleSecretId(accountA), 'WS-Q7a');
  expect((await h.call('list_accounts', {})).ok).toBe(true);
  h.engine.decideProposal({proposalId: pending.id, approve: true});
  expect(await running).toMatchObject({ok: false, error: {code: 'INVALID_ARGUMENT'}});
  expect(h.planner.snapshot().tasks).toEqual([]);
  expect(h.request).not.toHaveBeenCalled();
});

it('does not dispatch final assignment submission when the grant expires during save', async () => {
  const h = await setup('fixture-secret');
  const expiry = Date.now() + 2000;
  Object.assign(h.replies, {core_course_get_course_module: fixture.assignmentCm, mod_assign_get_assignments: fixture.assignments, mod_assign_get_submission_status: fixture.status, mod_assign_save_submission: [], mod_assign_submit_for_grading: []});
  h.engine.editGrant({grantId: h.client.grantInfo.id, scopes: h.client.grantInfo.scopes, accountIds: [accountA], expiresAt: new Date(expiry).toISOString()});
  h.request.mockImplementation(async (_url, init) => {
    const name = new URLSearchParams(String(init?.body)).get('wsfunction')!;
    if (name === 'mod_assign_save_submission') await new Promise(resolve => setTimeout(resolve, Math.max(0, expiry - Date.now() + 25)));
    return Response.json(h.replies[name]);
  });
  const running = h.call('submit_assignment', {courseId: courseA, moduleId: assignA, assignmentId: 52, text: 'My approved work.', studentOwned: true});
  h.engine.decideProposal({proposalId: (await proposal(h.engine)).id, approve: true});
  expect(await running).toMatchObject({ok: false, error: {code: 'EXPIRED'}});
  const calls = h.request.mock.calls.map(([, init]) => new URLSearchParams(String(init?.body)).get('wsfunction'));
  expect(calls).toContain('mod_assign_save_submission');
  expect(calls).not.toContain('mod_assign_submit_for_grading');
});

it('fences an approved mutation queued in the shared scheduler when its school disconnects', async () => {
  const h = await setup('fixture-secret');
  const queue = Reflect.get(h.moodle, 'queue') as MoodleScheduler;
  let release!:()=>void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const blockers:Promise<unknown>[] = [];
  h.request.mockImplementation(async (_url, init) => {
    const name = new URLSearchParams(String(init?.body)).get('wsfunction');
    if (name === 'core_course_get_course_module') {
      for (let index = 0; index < 6; index++) blockers.push(queue.run(10, async () => { await gate; }));
      return Response.json(fixture.cm);
    }
    return Response.json({status: true});
  });
  const running = h.call('mark_module_complete', {courseId: courseA, moduleId: moduleA});
  h.engine.decideProposal({proposalId: (await proposal(h.engine)).id, approve: true});
  try {
    await vi.waitFor(() => { expect(Reflect.get(queue, 'active')).toBe(6); expect(Reflect.get(queue, 'queue')).toHaveLength(1); });
    await h.moodle.disconnect(accountA);
  } finally { release(); }
  expect((await running).ok).toBe(false);
  await Promise.all(blockers);
  expect(h.request.mock.calls.map(([, init]) => new URLSearchParams(String(init?.body)).get('wsfunction'))).toEqual(['core_course_get_course_module']);
});
