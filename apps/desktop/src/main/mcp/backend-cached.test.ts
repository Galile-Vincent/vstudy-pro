/** Exercise safe cache reads, FTS account restrictions and planner relationship ownership. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { mcpTools, type ToolArguments } from '../../shared/mcp';
import { backendHarness, accountA, accountB, courseA, courseB, fileA, fileB, moduleA, now } from './backend-test-support';
import { BackendContext } from './backend-context';
import { BackendPages } from './backend-page';
import { BackendRemote } from './backend-remote';
import { cachedHandlers } from './backend-cached';
import { searchHandler } from './backend-search';
import { plannerHandlers, validateLocal } from './backend-planner';
import type { BackendServices } from './backend-types';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.close(); });
async function setup() {
  const h = await backendHarness(); harnesses.push(h);
  const services:BackendServices = {options:h.options, planner:h.planner, clock:h.options.clock!, remote:new BackendRemote(h.options), pages:new BackendPages()};
  const context = (args:ToolArguments = {limit:20}) => new BackendContext(h.repository, accountA, [accountA, accountB], args);
  return {...h, services, context, cached:cachedHandlers(services), plannerTools:plannerHandlers(services)};
}
const task = (courseId:string | null, title = 'Study') => ({title, courseId, dueAt:new Date(now + 86400000).toISOString(), estimateMinutes:30});

it('projects content without grade, submission, private file, URL or WS fields and remains offline', async () => {
  const h = await setup();
  const detail = h.repository.course(courseA);
  h.repository.apply(accountA, {courses:[detail.course], deadlines:[{id:randomUUID(), courseId:courseA, title:'Assignment', kind:'assignment', dueAt:new Date(now + 86400000).toISOString(), submitted:true, url:'https://school.test/private'}], notifications:[], grades:[{remoteKey:'1', value:{courseId:courseA, name:'Secret grade', grade:'99', max:100, percentage:99, gradedAt:null}}], files:h.repository.fileRecords(courseA)}, courseA);
  h.repository.expired(accountA);
  const args = mcpTools.get_course.schema.parse({courseId:courseA});
  const result = await h.cached.get_course(h.context(args), args);
  const value = JSON.stringify(result);
  expect(value).toContain('Algorithms');
  for (const denied of ['Secret grade', '"grade":"99"', 'submitted', 'https:', 'token', 'documentId', 'fileIds']) expect(value).not.toContain(denied);
  expect(h.context(args).provenance.syncedAt).not.toBeNull();
  expect(h.request).not.toHaveBeenCalled();
});

it('lists only granted accounts and filters before pagination', async () => {
  const h = await setup();
  const args = mcpTools.list_accounts.schema.parse({limit:1});
  const context = new BackendContext(h.repository, null, [accountB], args);
  expect((await h.cached.list_accounts(context, args)).content).toEqual({items:[{id:accountB, school:'Fixture university', user:'Student'}]});
});

it('reads only ready course-linked files in bounded authenticated text pages', async () => {
  const h = await setup();
  let args = mcpTools.read_file.schema.parse({fileId:fileA, limit:1});
  await expect(h.cached.read_file(h.context(args), args)).rejects.toMatchObject({code:'UNSUPPORTED'});
  h.document();
  h.read.mockResolvedValue('algorithm '.repeat(1300));
  const first = await h.cached.read_file(h.context(args), args);
  expect(first.content).toMatchObject({offset:0, text:'algorithm '.repeat(100)});
  args = mcpTools.read_file.schema.parse({...args, cursor:first.nextCursor});
  expect((await h.cached.read_file(h.context(args), args)).content).toMatchObject({offset:1000});
  h.read.mockResolvedValue('changed text');
  await expect(h.cached.read_file(h.context(args), args)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  expect(() => h.context(mcpTools.read_file.schema.parse({fileId:fileB}))).toThrow(expect.objectContaining({code:'DENIED'}));
  expect(h.request).not.toHaveBeenCalled();
});

it('checks file availability again after asynchronous document IO', async () => {
  const h = await setup(); h.document();
  h.read.mockImplementation(async () => { h.store.db.prepare('UPDATE moodle_files SET documentId=NULL WHERE id=?').run(fileA); return 'private content'; });
  const args = mcpTools.read_file.schema.parse({fileId:fileA});
  await expect(h.cached.read_file(h.context(args), args)).rejects.toMatchObject({code:'NOT_FOUND'});
});

it('searches synced modules and ready converted documents with literal FTS and scoped pagination', async () => {
  const h = await setup();
  h.document(fileB, 'algorithm private history');
  h.document(fileA, 'algorithm lecture 資料內容');
  const search = searchHandler(h.services);
  const args = mcpTools.search_content.schema.parse({query:'algorithm', limit:1});
  const first = await search(h.context(args), args);
  const results = [first];
  let cursor = first.nextCursor;
  while (cursor) {
    const nextArgs = mcpTools.search_content.schema.parse({...args, cursor});
    const next = await search(h.context(nextArgs), nextArgs); results.push(next); cursor = next.nextCursor;
  }
  expect(JSON.stringify(results)).toContain(fileA);
  expect(JSON.stringify(results)).not.toContain(fileB);
  expect(JSON.stringify(results)).not.toContain(courseB);
  const short = mcpTools.search_content.schema.parse({query:'資料'});
  expect(JSON.stringify(await search(h.context(short), short))).toContain('資料內容');
  const hostile = mcpTools.search_content.schema.parse({query:'" OR *'});
  expect((await search(h.context(hostile), hostile)).content).toEqual({items:[]});
  const wrongQuery = mcpTools.search_content.schema.parse({...args, query:'lecture', cursor:first.nextCursor});
  await expect(search(h.context(wrongQuery), wrongQuery)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
});

it('validates proposals without mutation and applies exact local effects through planner approvals', async () => {
  const h = await setup();
  const args = mcpTools.create_task.schema.parse({task:task(courseA)});
  validateLocal(h.context(args), h.services, 'create_task', args);
  expect(h.planner.snapshot().tasks).toHaveLength(0);
  await h.plannerTools.create_task(h.context(args), args);
  const created = h.planner.snapshot().tasks[0]!;
  expect(created).toMatchObject({title:'Study', courseId:courseA, source:'agent'});
  const update = mcpTools.update_task.schema.parse({taskId:created.id, changes:{courseId:courseB}});
  expect(() => validateLocal(h.context(update), h.services, 'update_task', update)).toThrow(expect.objectContaining({code:'DENIED'}));
  const foreignGoal = h.planner.saveGoal({id:randomUUID(), title:'Private goal', courseId:courseB, targetDate:null, status:'active'});
  const malicious = mcpTools.create_task.schema.parse({task:{...task(null), goalId:foreignGoal.id}});
  expect(() => validateLocal(h.context(malicious), h.services, 'create_task', malicious)).toThrow(expect.objectContaining({code:'DENIED'}));
});

it('hides a mixed-account plan as a whole, its blocks and foreign reminders and targets', async () => {
  const h = await setup();
  const foreign = h.planner.quickAdd(task(courseB, 'Private task'));
  const local = h.planner.quickAdd(task(null, 'Local task'));
  const planId = randomUUID();
  h.store.db.prepare('INSERT INTO planner_plans VALUES(?,?,?,?,?,?)').run(planId, 'Private shared title', 'UTC', 120, '["Private assumption"]', new Date(now).toISOString());
  for (const [courseId, id] of [[courseA, local.id], [courseB, foreign.id]]) h.store.db.prepare('INSERT INTO planner_blocks VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), planId, 'Private block', courseId!, 'task', id!, new Date(now + 3600000).toISOString(), 30);
  h.store.db.prepare('INSERT INTO planner_reminders VALUES(?,?,?,?,?,0)').run(randomUUID(), 'task', foreign.id, new Date(now + 3600000).toISOString(), 'Private reminder');
  const args = mcpTools.get_planner.schema.parse({});
  const result = JSON.stringify(await h.plannerTools.get_planner(h.context(args), args));
  expect(result).toContain('Local task');
  for (const value of ['Private', planId, foreign.id, courseB]) expect(result).not.toContain(value);
  const reminder = mcpTools.set_reminder.schema.parse({target:{kind:'task', id:foreign.id}, remindAt:new Date(now + 3600000).toISOString(), note:'Study'});
  expect(() => validateLocal(h.context(reminder), h.services, 'set_reminder', reminder)).toThrow(expect.objectContaining({code:'DENIED'}));
  const selection = mcpTools.export_calendar.schema.parse({selection:{taskIds:[foreign.id]}});
  await expect(h.plannerTools.export_calendar(h.context(selection), selection)).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(h.exportCalendar).not.toHaveBeenCalled();
});

it('opens only an approved typed module target through the supplied callback', async () => {
  const h = await setup();
  const args = mcpTools.open_in_app.schema.parse({courseId:courseA, moduleId:moduleA});
  h.context(args);
  expect(h.openModule).not.toHaveBeenCalled();
  await h.cached.open_in_app(h.context(args), args);
  expect(h.openModule).toHaveBeenCalledExactlyOnceWith(accountA, courseA, moduleA);
});
