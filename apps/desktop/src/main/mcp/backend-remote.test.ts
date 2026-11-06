/** Verify Moodle version projections and ownership through the exported backend factory. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import fixture3 from '../moodle/fixtures/mcp-3x.json';
import fixture4 from '../moodle/fixtures/mcp-4x.json';
import fixture5 from '../moodle/fixtures/mcp-5x.json';
import { backendHarness, accountA, accountB, courseA, courseB, moduleA } from './backend-test-support';
import { createMcpBackend } from './backend';
import { mcpTools, type ToolName } from '../../shared/mcp';
import { moodleSecretId } from '../services/secrets';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.close(); });
async function setup(fixture = fixture4) {
  const h = await backendHarness(); harnesses.push(h);
  Object.assign(h.replies, {mod_quiz_get_quizzes_by_courses:fixture.quizzes, mod_quiz_get_user_attempts:fixture.attempts, mod_forum_get_forums_by_courses:fixture.forums, mod_forum_get_forum_discussions:fixture.discussions, mod_forum_get_discussion_posts:fixture.posts});
  return {...h, backend:createMcpBackend(h.options)};
}

it.each([fixture3, fixture4, fixture5])('projects $release quiz metadata and grades without assessment internals', async fixture => {
  const h = await setup();
  h.replies.mod_quiz_get_quizzes_by_courses = fixture.quizzes;
  h.replies.mod_quiz_get_user_attempts = fixture.attempts;
  const listed = await (await h.backend.prepare('list_quizzes', mcpTools.list_quizzes.schema.parse({courseId:courseA}), [accountA])).execute();
  expect(JSON.stringify(listed)).not.toMatch(/grade|password|question|sebconfig|introfiles/i);
  const info = await (await h.backend.prepare('get_quiz_info', mcpTools.get_quiz_info.schema.parse({courseId:courseA, quizId:51}), [accountA])).execute();
  expect(info.content).toMatchObject({quiz:{id:51}, items:[{id:71, state:'finished', grade:8.5}]});
  expect(JSON.stringify(info)).not.toMatch(/layout|question|answer|review|https|token|password|sebconfig/i);
  const names = h.request.mock.calls.map(row => new URLSearchParams(String(row[1]?.body)).get('wsfunction'));
  expect(names).toEqual(['mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts']);
});

it.each([fixture3, fixture4, fixture5])('verifies $release discussion membership and returns only inert public post fields', async fixture => {
  const h = await setup();
  Object.assign(h.replies, {mod_forum_get_forums_by_courses:fixture.forums, mod_forum_get_forum_discussions:fixture.discussions, mod_forum_get_discussion_posts:fixture.posts});
  const result = await (await h.backend.prepare('get_discussion', mcpTools.get_discussion.schema.parse({courseId:courseA, discussionId:41}), [accountA])).execute();
  expect(result.content).toMatchObject({items:[{id:61, author:'Teacher'}]});
  expect(JSON.stringify(result)).not.toMatch(/email|teacher@|profile|https|token|<script>|steal\(\)/i);
  const args = mcpTools.list_forums.schema.parse({courseId:courseA});
  expect((await (await h.backend.prepare('list_forums', args, [accountA])).execute()).content).toMatchObject({items:[{kind:'forum', id:31}, {kind:'discussion', id:41}]});
});

it('does not read cross-course discussions even when the requested discussion exists on the school', async () => {
  const h = await setup();
  h.replies.mod_forum_get_forums_by_courses = [{...fixture4.forums[0], course:20}];
  const call = await h.backend.prepare('get_discussion', mcpTools.get_discussion.schema.parse({courseId:courseA, discussionId:41}), [accountA]);
  await expect(call.execute()).rejects.toMatchObject({code:'DENIED'});
  expect(h.request.mock.calls.some(row => String(row[1]?.body).includes('wsfunction=mod_forum_get_discussion_posts'))).toBe(false);
});

it('checks quiz ownership and attempt user IDs before exposing state or grades', async () => {
  const h = await setup();
  const call = await h.backend.prepare('get_quiz_info', mcpTools.get_quiz_info.schema.parse({courseId:courseA, quizId:51}), [accountA]);
  h.replies.mod_quiz_get_quizzes_by_courses = {quizzes:[{...fixture4.quizzes.quizzes[0], course:20}]};
  await expect(call.execute()).rejects.toMatchObject({code:'DENIED'});
  h.replies.mod_quiz_get_quizzes_by_courses = fixture4.quizzes;
  h.replies.mod_quiz_get_user_attempts = {attempts:[{...fixture4.attempts.attempts[0], userid:8}]};
  await expect(call.execute()).rejects.toMatchObject({code:'DENIED'});
});

it('filters calendar events and returns participant names without contacts or IDs', async () => {
  const h = await setup();
  h.replies.core_calendar_get_calendar_upcoming_view = {events:[{id:'1', name:'Class', course:{id:'10'}, timestart:'1793923200', url:'https://school.test/private'}, {id:2, name:'Private', courseid:20}]};
  const calendar = await (await h.backend.prepare('get_calendar', mcpTools.get_calendar.schema.parse({}), [accountA])).execute();
  expect(calendar.content).toEqual({items:[{id:1, courseId:courseA, title:'Class', startsAt:'2026-11-06T00:00:00.000Z', durationSeconds:0}]});
  h.replies.core_enrol_get_enrolled_users = [{id:7, fullname:'Student', email:'student@school.test', profileurl:'https://school.test/profile', contacts:['private']}];
  const names = await (await h.backend.prepare('get_participants_summary', mcpTools.get_participants_summary.schema.parse({courseId:courseA}), [accountA])).execute();
  expect(names.content).toEqual({items:[{name:'Student'}]});
});

it('returns cached grades offline and verifies the remote grade owner when no cache exists', async () => {
  const h = await setup();
  h.replies.gradereport_user_get_grade_items = {usergrades:[{userid:8, gradeitems:[]}]};
  const call = await h.backend.prepare('get_grades', mcpTools.get_grades.schema.parse({courseId:courseA}), [accountA]);
  await expect(call.execute()).rejects.toMatchObject({code:'DENIED'});
  const detail = h.repository.course(courseA);
  h.repository.apply(accountA, {courses:[detail.course], deadlines:detail.deadlines, notifications:[], grades:[{remoteKey:'1', value:{courseId:courseA, name:'Essay', grade:'90', max:100, percentage:90, gradedAt:null}}], files:h.repository.fileRecords(courseA)}, courseA);
  h.repository.expired(accountA);
  h.request.mockClear();
  expect((await call.execute()).content).toMatchObject({items:[{name:'Essay', grade:'90'}]});
  expect(h.request).not.toHaveBeenCalled();
});

it('rejects missing and unknown remote capabilities without a school call', async () => {
  const h = await setup();
  for (const functions of [undefined, []]) {
    h.repository.saveCapabilities(accountA, {functions, advancedfeatures:[], mobileConfig:{}});
    for (const [name, input] of [['get_calendar', {}], ['list_forums', {courseId:courseA}], ['get_discussion', {courseId:courseA, discussionId:41}], ['get_grades', {courseId:courseA}], ['list_quizzes', {courseId:courseA}], ['get_quiz_info', {courseId:courseA, quizId:51}], ['get_participants_summary', {courseId:courseA}], ['sync_now', {}]] as const) {
      const call = await h.backend.prepare(name, mcpTools[name].schema.parse(input), [accountA]);
      await expect(call.execute()).rejects.toMatchObject({code:'UNSUPPORTED'});
    }
  }
  expect(h.request).not.toHaveBeenCalled();
});

it('denies selected-account cross references for every course tool before IO', async () => {
  const h = await setup();
  const calls:Partial<Record<ToolName, object>> = {
    get_course:{courseId:courseB}, get_module:{courseId:courseB, moduleId:moduleA}, search_content:{courseId:courseB, query:'Algorithms'}, list_deadlines:{courseId:courseB}, list_announcements:{courseId:courseB}, list_forums:{courseId:courseB}, get_discussion:{courseId:courseB, discussionId:41}, get_grades:{courseId:courseB}, list_files:{courseId:courseB}, list_quizzes:{courseId:courseB}, get_quiz_info:{courseId:courseB, quizId:51}, get_participants_summary:{courseId:courseB}, mark_module_complete:{courseId:courseB, moduleId:moduleA}, post_forum_reply:{courseId:courseB, discussionId:41, postId:61, subject:'Reply', message:'Text'}, submit_assignment:{courseId:courseB, moduleId:moduleA, assignmentId:52, text:'My text', studentOwned:true}, open_in_app:{courseId:courseB, moduleId:moduleA},
  };
  for (const [name, input] of Object.entries(calls)) {
    const tool = name as ToolName;
    await expect(h.backend.prepare(tool, mcpTools[tool].schema.parse({account:accountA, ...input}), [accountA, accountB])).rejects.toMatchObject({code:'DENIED'});
  }
  expect(h.request).not.toHaveBeenCalled();
});

it('exposes only newly loaded main-side secrets to synchronous redaction and never tool data', async () => {
  const h = await setup();
  h.secrets.useInSession(moodleSecretId(accountA), JSON.stringify({token:'school-token-' + accountA, privateToken:'private-token', userPrivateAccessKey:'access-key'}));
  expect(h.backend.secretValues()).toEqual([]);
  const result = await (await h.backend.prepare('list_quizzes', mcpTools.list_quizzes.schema.parse({courseId:courseA}), [accountA])).execute();
  expect(h.backend.secretValues()).toEqual(['school-token-' + accountA, 'private-token', 'access-key']);
  expect(JSON.stringify(result)).not.toContain('school-token');
});
