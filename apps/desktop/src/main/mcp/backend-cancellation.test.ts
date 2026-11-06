/** Ensure grant cancellation stops queued requests, in-flight reads and follow-up submission effects. @packageDocumentation */
import { afterEach, expect, it, vi } from 'vitest';
import fixture from '../moodle/fixtures/mcp-4x.json';
import { backendHarness, accountA, courseA, moduleA, assignA } from './backend-test-support';
import { createMcpBackend } from './backend';
import { mcpTools } from '../../shared/mcp';
import { McpEngine } from './engine';
import { GrantStore } from './grants';
import { countingStatePersistence } from './state-test-fixture';
import { call, pair } from './test-fixture';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.close(); });
async function setup() {
  const h = await backendHarness(); harnesses.push(h);
  Object.assign(h.replies, {core_calendar_get_calendar_upcoming_view:{events:[]}, core_course_get_course_module:fixture.assignmentCm, mod_assign_get_assignments:fixture.assignments, mod_assign_get_submission_status:fixture.status, mod_assign_save_submission:[], mod_assign_submit_for_grading:[]});
  return {...h, backend:createMcpBackend(h.options)};
}

const preparationReads = ['core_course_get_course_module', 'mod_assign_get_assignments', 'mod_assign_get_submission_status'];
it.each(preparationReads)('revocation during preparation at %s aborts transport and prevents later authenticated reads', async blocked => {
  const h = await setup();
  const persistence = countingStatePersistence();
  const engine = new McpEngine({userData:'profile', backend:h.backend, persistence, limits:{spacingMs:0, jitterMs:0}});
  let entered!:() => void, release!:() => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let signal:AbortSignal | null | undefined;
  h.request.mockImplementation(async (_url, init) => {
    const name = new URLSearchParams(String(init?.body)).get('wsfunction')!;
    if (name === blocked) { signal = init?.signal; entered(); await gate; }
    // An already-dispatched response can still arrive after revocation.
    return Response.json(h.replies[name]);
  });
  try {
    engine.setEnabled(true);
    const client = await pair(engine, [accountA]);
    const pending = call(engine, client.grant, 'save_assignment_draft', {courseId:courseA, moduleId:assignA, assignmentId:52, text:'My essay.', studentOwned:true});
    await ready;
    const writes = persistence.write.mock.calls.length;
    engine.revoke(client.grantInfo.id);
    expect(signal?.aborted).toBe(true);
    expect(await pending).toMatchObject({ok:false, error:{code:'DENIED'}});
    release();
    await vi.waitFor(() => expect(engine.state().activeCalls).toBe(0));
    const functions = h.request.mock.calls.map(row => new URLSearchParams(String(row[1]?.body)).get('wsfunction'));
    expect(functions).toEqual(preparationReads.slice(0, preparationReads.indexOf(blocked) + 1));
    expect(engine.state().proposals).toEqual([]);
    expect(engine.state().activity).toEqual([]);
    expect(persistence.write).toHaveBeenCalledTimes(writes + 1);
    expect(() => new GrantStore('profile', Date.now, persistence).authorize(client.grant)).toThrow('DENIED');
  } finally { release(); engine.dispose(); }
});

it('expiry during preparation stops new reads through live authorization without a cancelled signal', async () => {
  const h = await setup();
  const persistence = countingStatePersistence();
  let now = Date.now();
  const engine = new McpEngine({userData:'profile', backend:h.backend, persistence, now:() => now, limits:{spacingMs:0, jitterMs:0}});
  let entered!:() => void, release!:() => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let signal:AbortSignal | null | undefined;
  h.request.mockImplementation(async (_url, init) => {
    signal = init?.signal;
    entered(); await gate;
    const name = new URLSearchParams(String(init?.body)).get('wsfunction')!;
    return Response.json(h.replies[name]);
  });
  try {
    engine.setEnabled(true);
    const client = await pair(engine, [accountA]);
    const writes = persistence.write.mock.calls.length;
    const pending = call(engine, client.grant, 'save_assignment_draft', {courseId:courseA, moduleId:assignA, assignmentId:52, text:'My essay.', studentOwned:true});
    await ready;
    now = Date.parse(client.grantInfo.expiresAt);
    release();
    expect(await pending).toMatchObject({ok:false, error:{code:'EXPIRED'}});
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    expect(persistence.write).toHaveBeenCalledTimes(writes);
    expect(engine.state().proposals).toEqual([]);
  } finally { release(); engine.dispose(); }
});

it('aborts a prepared write while queued without dispatching validation reads or mutations', async () => {
  const h = await setup();
  let started!:() => void, release!:() => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  h.request.mockImplementation(async () => { started(); await gate; return Response.json({events:[]}); });
  const read = await h.backend.prepare('get_calendar', mcpTools.get_calendar.schema.parse({}), [accountA]);
  const reading = read.execute();
  await ready;
  const controller = new AbortController();
  const write = await h.backend.prepare('mark_module_complete', mcpTools.mark_module_complete.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA]);
  const writing = write.execute(controller.signal);
  const denied = expect(writing).rejects.toMatchObject({code:'DENIED'});
  controller.abort(); release();
  await Promise.all([reading, denied]);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(new URLSearchParams(String(h.request.mock.calls[0]![1]?.body)).get('wsfunction')).toBe('core_calendar_get_calendar_upcoming_view');
});

it('passes cancellation to an in-flight transport and makes no subsequent school request', async () => {
  const h = await setup();
  let started!:() => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let transportSignal:AbortSignal | null | undefined;
  h.request.mockImplementation(async (_url, init) => {
    transportSignal = init?.signal;
    started();
    await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted secret diagnostic')), {once:true}));
    return Response.json({events:[]});
  });
  const controller = new AbortController();
  const prepared = await h.backend.prepare('get_calendar', mcpTools.get_calendar.schema.parse({}), [accountA]);
  const running = prepared.execute(controller.signal);
  const rejected = expect(running).rejects.toMatchObject({code:'DISCONNECTED'});
  await ready; controller.abort();
  await rejected;
  expect(transportSignal?.aborted).toBe(true);
  expect(h.request).toHaveBeenCalledTimes(1);
});

it('stops after assignment save when approval is revoked before final submission', async () => {
  const h = await setup();
  const controller = new AbortController();
  h.request.mockImplementation(async (_url, init) => {
    const name = new URLSearchParams(String(init?.body)).get('wsfunction')!;
    if (name === 'mod_assign_save_submission') controller.abort();
    return Response.json(h.replies[name]);
  });
  const args = mcpTools.save_assignment_draft.schema.parse({courseId:courseA, moduleId:assignA, assignmentId:52, text:'My approved essay.', studentOwned:true});
  await expect((await h.backend.prepare('save_assignment_draft', args, [accountA])).execute(controller.signal)).rejects.toMatchObject({code:'DENIED'});
  const functions = h.request.mock.calls.map(row => new URLSearchParams(String(row[1]?.body)).get('wsfunction'));
  expect(functions.at(-1)).toBe('mod_assign_save_submission');
  expect(functions).not.toContain('mod_assign_submit_for_grading');
});

it('does not run local mutations or app callbacks with a cancelled approval', async () => {
  const h = await setup();
  const controller = new AbortController(); controller.abort();
  const open = await h.backend.prepare('open_in_app', mcpTools.open_in_app.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA]);
  await expect(open.execute(controller.signal)).rejects.toMatchObject({code:'DENIED'});
  const create = await h.backend.prepare('create_task', mcpTools.create_task.schema.parse({task:{title:'Study', courseId:courseA, dueAt:null, estimateMinutes:30}}), [accountA]);
  await expect(create.execute(controller.signal)).rejects.toMatchObject({code:'DENIED'});
  expect(h.openModule).not.toHaveBeenCalled();
  expect(h.planner.snapshot().tasks).toHaveLength(0);
  expect(h.request).not.toHaveBeenCalled();
});
