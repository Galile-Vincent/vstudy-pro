/** Assert deferred, exact and non-retried approved effects, including hostile completion and submission inputs. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import fixture3 from '../moodle/fixtures/mcp-3x.json';
import fixture4 from '../moodle/fixtures/mcp-4x.json';
import fixture5 from '../moodle/fixtures/mcp-5x.json';
import { backendHarness, accountA, courseA, courseB, moduleA, assignA, now } from './backend-test-support';
import { createMcpBackend } from './backend';
import { mcpTools, type ToolName } from '../../shared/mcp';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.close(); });
async function setup() {
  const h = await backendHarness(); harnesses.push(h);
  Object.assign(h.replies, {
    core_course_get_course_module:fixture4.cm, core_completion_update_activity_completion_status_manually:{status:true, warnings:[]},
    mod_assign_get_assignments:fixture4.assignments, mod_assign_get_submission_status:fixture4.status,
    mod_assign_save_submission:[], mod_assign_submit_for_grading:[],
    mod_forum_get_forums_by_courses:fixture4.forums, mod_forum_get_forum_discussions:fixture4.discussions,
    mod_forum_get_discussion_posts:fixture4.posts, mod_forum_add_discussion_post:{postid:62, warnings:[]},
  });
  const backend = createMcpBackend(h.options);
  const writes = () => h.request.mock.calls.map(row => new URLSearchParams(String(row[1]?.body))).filter(params => /^(mod_assign_(?:save_submission|submit_for_grading)|mod_forum_add_discussion_post|core_completion_update_activity_completion_status_manually)$/.test(params.get('wsfunction') ?? ''));
  return {...h, backend, writes};
}
const submission = () => mcpTools.save_assignment_draft.schema.parse({courseId:courseA, moduleId:assignA, assignmentId:52, text:'My own essay.', studentOwned:true});

it('prepares every registry write without mutations and reads assignment state for approval', async () => {
  const h = await setup();
  const task = h.planner.quickAdd({title:'Study', courseId:courseA, dueAt:new Date(now + 86400000).toISOString(), estimateMinutes:30});
  const cases:Partial<Record<ToolName, object>> = {
    create_task:{task:{title:'Plan', courseId:courseA, dueAt:null, estimateMinutes:30}},
    update_task:{taskId:task.id, changes:{title:'Updated'}},
    create_study_plan_proposal:{plan:{title:'Week', timeZone:'UTC', dailyBudgetMinutes:120, assumptions:['Study time'], blocks:[{title:'Study', courseId:courseA, target:{kind:'task', id:task.id}, startsAt:new Date(now + 3600000).toISOString(), durationMinutes:30}]}},
    set_reminder:{target:{kind:'task', id:task.id}, remindAt:new Date(now + 3600000).toISOString(), note:'Study'},
    export_calendar:{selection:{taskIds:[task.id]}}, mark_module_complete:{courseId:courseA, moduleId:moduleA},
    post_forum_reply:{courseId:courseA, discussionId:41, postId:61, subject:'Reply', message:'My response.'},
    save_assignment_draft:submission(), open_in_app:{courseId:courseA, moduleId:moduleA},
  };
  h.replies.core_course_get_course_module = fixture4.assignmentCm;
  const baseline = h.planner.snapshot();
  for (const name of Object.keys(mcpTools) as ToolName[]) {
    if (mcpTools[name].risk === 'read') continue;
    expect(cases[name], name).toBeDefined();
    await h.backend.prepare(name, mcpTools[name].schema.parse(cases[name]), [accountA]);
  }
  expect(h.planner.snapshot()).toEqual(baseline);
  expect(h.writes()).toHaveLength(0);
  expect(h.openModule).not.toHaveBeenCalled();
  expect(h.exportCalendar).not.toHaveBeenCalled();
});

it.each([fixture4, fixture5])('allows only current affirmative manual ungraded completion on $release', async fixture => {
  const h = await setup(); h.replies.core_course_get_course_module = fixture.cm;
  const prepared = await h.backend.prepare('mark_module_complete', mcpTools.mark_module_complete.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA]);
  expect(h.writes()).toHaveLength(0);
  expect((await prepared.execute()).content).toEqual({completed:true, moduleId:moduleA});
  expect(Object.fromEntries(h.writes()[0]!)).toMatchObject({cmid:'101', completed:'1', wsfunction:'core_completion_update_activity_completion_status_manually'});
  await expect(prepared.execute()).rejects.toMatchObject({code:'EXPIRED'});
  expect(h.writes()).toHaveLength(1);
});

it.each([
  ['grade item', {completiongradeitemnumber:0, ungraded:true}],
  ['pass grade', {completionpassgrade:1, isgraded:false}],
  ['automatic', {completion:2}], ['missing grade item', {completiongradeitemnumber:undefined}],
  ['missing pass-grade field', {completionpassgrade:undefined}], ['plugin grade', {grade:100}],
  ['plugin completion', {completioncustomrules:[{graded:true}]}], ['plugin graded flag', {graded:true}],
  ['unknown tracking', {completion:undefined}], ['grade threshold', {gradepass:60}],
  ['changed activity type', {modname:'quiz'}],
])('forbids %s completion before the write', async (_label, patch) => {
  const h = await setup();
  h.replies.core_course_get_course_module = {cm:{...fixture4.cm.cm, ...patch}, warnings:[]};
  const prepared = await h.backend.prepare('mark_module_complete', mcpTools.mark_module_complete.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA]);
  await expect(prepared.execute()).rejects.toMatchObject({code:'ACADEMIC_INTEGRITY'});
  expect(h.writes()).toHaveLength(0);
});

it('denies 3.x completion with absent grade evidence and every assessed or unknown module kind', async () => {
  const h = await setup(); h.replies.core_course_get_course_module = fixture3.cm;
  await expect((await h.backend.prepare('mark_module_complete', mcpTools.mark_module_complete.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA])).execute()).rejects.toMatchObject({code:'ACADEMIC_INTEGRITY'});
  const detail = h.repository.course(courseA);
  for (const kind of ['quiz', 'assign', 'h5p', 'video', 'other'] as const) {
    h.repository.saveDetail(courseA, {sections:detail.sections.map(section => ({...section, modules:section.modules.map(module => ({...module, kind, modname:kind}))}))});
    await expect(h.backend.prepare('mark_module_complete', mcpTools.mark_module_complete.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA])).rejects.toMatchObject({code:'ACADEMIC_INTEGRITY'});
  }
  expect(h.writes()).toHaveLength(0);
});

it.each([fixture3, fixture4, fixture5])('saves exact student-owned plain text as a draft on $release without final submission', async fixture => {
  const h = await setup();
  Object.assign(h.replies, {core_course_get_course_module:fixture.assignmentCm, mod_assign_get_assignments:fixture.assignments, mod_assign_get_submission_status:fixture.status});
  const prepared = await h.backend.prepare('save_assignment_draft', submission(), [accountA]);
  expect(h.writes()).toHaveLength(0);
  const result = await prepared.execute();
  expect(result.content).toMatchObject({message:'Draft saved. Review and submit it yourself in Moodle', open_in_app:{courseId:courseA, moduleId:assignA}});
  expect(h.writes()).toHaveLength(1);
  expect(Object.fromEntries(h.writes()[0]!)).toMatchObject({wsfunction:'mod_assign_save_submission', assignmentid:'52', 'plugindata[onlinetext_editor][text]':'My own essay.', 'plugindata[onlinetext_editor][format]':'2', 'plugindata[onlinetext_editor][itemid]':'0'});
  expect(h.writes().some(call => call.get('wsfunction') === 'mod_assign_submit_for_grading')).toBe(false);
});

it('rejects assignment IDs that differ from the module instance or current assignment cmid', async () => {
  const h = await setup();
  await expect(h.backend.prepare('save_assignment_draft', submission(), [accountA])).rejects.toMatchObject({code:'DENIED'});
  h.replies.core_course_get_course_module = fixture4.assignmentCm;
  h.replies.mod_assign_get_assignments = {courses:[{id:10, assignments:[{...fixture4.assignments.courses[0]!.assignments[0], cmid:999}]}]};
  await expect(h.backend.prepare('save_assignment_draft', submission(), [accountA])).rejects.toMatchObject({code:'DENIED'});
  expect(h.writes()).toHaveLength(0);
});

it.each([
  ['statement', {requiresubmissionstatement:1}], ['team workflow', {teamsubmission:1}],
  ['unknown statement rules', {requiresubmissionstatement:undefined}], ['no draft workflow', {submissiondrafts:0}],
  ['file-only', {configs:[{plugin:'file', subtype:'assignsubmission', name:'enabled', value:'1'}]}],
])('rejects unsupported %s without saving or submitting', async (_label, patch) => {
  const h = await setup();
  h.replies.core_course_get_course_module = fixture4.assignmentCm;
  h.replies.mod_assign_get_assignments = {courses:[{id:10, assignments:[{...fixture4.assignments.courses[0]!.assignments[0], ...patch}]}]};
  await expect(h.backend.prepare('save_assignment_draft', submission(), [accountA])).rejects.toMatchObject({code:'UNSUPPORTED'});
  expect(h.writes()).toHaveLength(0);
});

it('never retries an uncertain submission save and never submits after save warnings', async () => {
  const h = await setup(); h.replies.core_course_get_course_module = fixture4.assignmentCm;
  h.replies.mod_assign_save_submission = [{warningcode:'error', message:'token=secret'}];
  await expect((await h.backend.prepare('save_assignment_draft', submission(), [accountA])).execute()).rejects.toMatchObject({code:'UNSUPPORTED'});
  expect(h.writes()).toHaveLength(1);
  h.request.mockImplementation(async (_url, init) => {
    const name = new URLSearchParams(String(init?.body)).get('wsfunction')!;
    if (name === 'mod_assign_save_submission') throw new Error('Network failed token=secret');
    return Response.json(h.replies[name]);
  });
  h.request.mockClear();
  await expect((await h.backend.prepare('save_assignment_draft', submission(), [accountA])).execute()).rejects.toMatchObject({code:'DISCONNECTED'});
  expect(h.writes()).toHaveLength(1);
});

it('validates the parent post belongs to the discussion before publishing exact plain text', async () => {
  const h = await setup();
  const args = mcpTools.post_forum_reply.schema.parse({courseId:courseA, discussionId:41, postId:61, subject:'Reply', message:'My response.'});
  await (await h.backend.prepare('post_forum_reply', args, [accountA])).execute();
  expect(Object.fromEntries(h.writes()[0]!)).toMatchObject({postid:'61', subject:'Reply', message:'My response.', messageformat:'2'});
  const foreignParent = {...args, postId:999};
  await expect((await h.backend.prepare('post_forum_reply', foreignParent, [accountA])).execute()).rejects.toMatchObject({code:'DENIED'});
  h.replies.mod_forum_get_forums_by_courses = [{...fixture4.forums[0], course:20}];
  await expect((await h.backend.prepare('post_forum_reply', args, [accountA])).execute()).rejects.toMatchObject({code:'DENIED'});
  expect(h.writes()).toHaveLength(1);
});

it('rechecks task ownership after approval and clones the exact proposed payload', async () => {
  const h = await setup();
  const args = mcpTools.create_task.schema.parse({task:{title:'Approved', courseId:courseA, dueAt:null, estimateMinutes:30}});
  const create = await h.backend.prepare('create_task', args, [accountA]);
  args.task.title = 'Changed after approval';
  await create.execute();
  const task = h.planner.snapshot().tasks[0]!;
  expect(task.title).toBe('Approved');
  const update = await h.backend.prepare('update_task', mcpTools.update_task.schema.parse({taskId:task.id, changes:{title:'Edited'}}), [accountA]);
  h.store.db.prepare('UPDATE planner_tasks SET courseId=? WHERE id=?').run(courseB, task.id);
  await expect(update.execute()).rejects.toMatchObject({code:'DENIED'});
  expect(h.planner.snapshot().tasks[0]!.title).toBe('Approved');
});

it('applies local plan, reminder and calendar callbacks through approved one-shot executors', async () => {
  const h = await setup();
  const task = h.planner.quickAdd({title:'Study', courseId:courseA, dueAt:new Date(now + 86400000).toISOString(), estimateMinutes:30});
  const target = {kind:'task' as const, id:task.id};
  const plan = mcpTools.create_study_plan_proposal.schema.parse({plan:{title:'Week', timeZone:'UTC', dailyBudgetMinutes:120, assumptions:['Free morning'], blocks:[{title:'Study', courseId:courseA, target, startsAt:new Date(now + 3600000).toISOString(), durationMinutes:30}]}});
  await (await h.backend.prepare('create_study_plan_proposal', plan, [accountA])).execute();
  expect(h.planner.snapshot().plans[0]).toMatchObject({title:'Week'});
  const reminder = mcpTools.set_reminder.schema.parse({target, remindAt:new Date(now + 1800000).toISOString(), note:'Read first'});
  await (await h.backend.prepare('set_reminder', reminder, [accountA])).execute();
  expect(h.planner.snapshot().reminders[0]).toMatchObject({target, note:'Read first'});
  const selection = mcpTools.export_calendar.schema.parse({selection:{taskIds:[task.id]}});
  await (await h.backend.prepare('export_calendar', selection, [accountA])).execute();
  expect(h.exportCalendar).toHaveBeenCalledExactlyOnceWith({taskIds:[task.id]});
  await expect(h.backend.prepare('set_reminder', {...reminder, target:{kind:'task', id:randomUUID()}}, [accountA])).rejects.toMatchObject({code:'DENIED'});
});
