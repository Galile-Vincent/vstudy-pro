/** Exercise cold course reads and announcements without first visiting a course in the UI. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import { mcpTools, type ToolName } from '../../shared/mcp';
import { createMcpBackend } from './backend';
import { backendHarness, accountA, courseA, courseB, now } from './backend-test-support';

const harnesses: Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const harness of harnesses.splice(0)) await harness.close(); });
async function setup() {
  const h = await backendHarness();
  harnesses.push(h);
  const backend = createMcpBackend(h.options);
  const call = async (name: ToolName, input: object) => (await backend.prepare(name, mcpTools[name].schema.parse(input), [accountA])).execute();
  return {...h, call};
}
const contents = [{id: 1, section: 1, name: 'Week one', modules: [{id: 101, name: 'First lecture', modname: 'resource', contents: [{type: 'file', filename: 'lecture.pdf', fileurl: 'https://school.test/pluginfile.php/lecture.pdf'}]}]}];
function news(h: Awaited<ReturnType<typeof setup>>) {
  h.replies.mod_forum_get_forums_by_courses = [{id: 11, course: 10, type: 'news', name: 'Announcements'}, {id: 22, course: 20, type: 'news', name: 'Foreign course'}];
  h.replies.mod_forum_get_forum_discussions = {discussions: [{id: 31, discussion: 30, forum: 11, subject: 'Class moved', created: now / 1000}]};
  h.replies.mod_forum_get_discussion_posts = {posts: [{id: 31, discussionid: 30, parentid: 0, message: '<p>Read chapter two.</p>', author: {fullname: 'Instructor'}}]};
}

it('loads a never-opened course and its files through the selected course ID once', async () => {
  const h = await setup();
  h.store.db.prepare('DELETE FROM moodle_course_details WHERE courseId=?').run(courseA);
  h.replies.core_course_get_contents = contents;
  expect(JSON.stringify(await h.call('get_course', {courseId: courseA}))).toContain('First lecture');
  expect(JSON.stringify(await h.call('list_files', {courseId: courseA}))).toContain('lecture.pdf');
  expect(h.request).toHaveBeenCalledTimes(1);
  const body = new URLSearchParams(String(h.request.mock.calls[0]![1]?.body));
  expect(body.get('courseid')).toBe('10');
  h.repository.expired(accountA);
  await h.call('get_course', {courseId: courseA});
  expect(h.request).toHaveBeenCalledTimes(1);
});

it('returns a capability error for a cold course instead of falsely reporting empty contents', async () => {
  const h = await setup();
  h.store.db.prepare('DELETE FROM moodle_course_details WHERE courseId=?').run(courseA);
  const caps = h.repository.capabilities(accountA)!;
  h.repository.saveCapabilities(accountA, {...caps, functions: caps.functions!.filter(name => name !== 'core_course_get_contents')});
  await expect(h.call('get_course', {courseId: courseA})).rejects.toMatchObject({code: 'UNSUPPORTED'});
  await expect(h.call('list_files', {courseId: courseA})).rejects.toMatchObject({code: 'UNSUPPORTED'});
  expect(h.request).not.toHaveBeenCalled();
});

it('reads announcement root posts and caches inert content for offline use', async () => {
  const h = await setup();
  news(h);
  const result = await h.call('list_announcements', {courseId: courseA});
  expect(result.content).toMatchObject({items: [{subject: 'Class moved', author: 'Instructor', text: ' Read chapter two. '}]});
  expect(JSON.stringify(result)).not.toContain('Foreign course');
  expect(h.repository.course(courseA).announcements).toHaveLength(1);
  const requests = h.request.mock.calls.map(([, init]) => new URLSearchParams(String(init?.body)));
  expect(requests.find(params => params.get('wsfunction') === 'mod_forum_get_forum_discussions')?.get('forumid')).toBe('11');
  h.repository.expired(accountA);
  expect(JSON.stringify(await h.call('list_announcements', {courseId: courseA}))).toContain('Read chapter two.');
  expect(h.request).toHaveBeenCalledTimes(3);
});

it('does not report an unsupported announcements API as an empty list', async () => {
  const h = await setup();
  h.repository.saveCapabilities(accountA, {functions: [], advancedfeatures: [], mobileConfig: {}});
  await expect(h.call('list_announcements', {courseId: courseA})).rejects.toMatchObject({code: 'UNSUPPORTED'});
});

it('rejects cross-course announcement targets and inconsistent post membership', async () => {
  const h = await setup();
  news(h);
  await expect(h.call('list_announcements', {courseId: courseB})).rejects.toMatchObject({code: 'DENIED'});
  expect(h.request).not.toHaveBeenCalled();
  h.replies.mod_forum_get_discussion_posts = {posts: [{id: 31, discussionid: 99, parentid: 0, message: 'Foreign body'}]};
  await expect(h.call('list_announcements', {courseId: courseA})).rejects.toMatchObject({code: 'DENIED'});
  expect(h.repository.course(courseA).announcements).toEqual([]);
});

it('does not substitute a private reply for the announcement body', async () => {
  const h = await setup();
  news(h);
  h.replies.mod_forum_get_discussion_posts = {posts: [{id: 31, discussionid: 30, parentid: 0, message: 'Private reply', isprivatereply: true}]};
  await expect(h.call('list_announcements', {courseId: courseA})).rejects.toMatchObject({code: 'UNSUPPORTED'});
  expect(h.repository.course(courseA).announcements).toEqual([]);
});

it('does not mistake an announcements-only cache for loaded course sections', async () => {
  const h = await setup();
  h.store.db.prepare('DELETE FROM moodle_course_details WHERE courseId=?').run(courseA);
  news(h);
  h.replies.core_course_get_contents = contents;
  await h.call('list_announcements', {courseId: courseA});
  expect(h.repository.hasCoursePanelCache(courseA, 'sections')).toBe(false);
  expect(h.repository.hasCoursePanelCache(courseA, 'announcements')).toBe(true);
  expect(JSON.stringify(await h.call('get_course', {courseId: courseA}))).toContain('First lecture');
  expect(h.repository.hasCoursePanelCache(courseA, 'sections')).toBe(true);
  expect(h.repository.course(courseA).announcements).toHaveLength(1);
});

it('preserves a successfully empty panel offline and loads ambiguous empty legacy sections once', async () => {
  const h = await setup();
  h.replies.mod_forum_get_forums_by_courses = [];
  expect((await h.call('list_announcements', {courseId: courseA})).content).toEqual({items: []});
  h.repository.expired(accountA);
  expect((await h.call('list_announcements', {courseId: courseA})).content).toEqual({items: []});
  const account = h.repository.account(accountA);
  h.repository.saveAccount({...account, status: 'connected'});
  h.store.db.prepare('UPDATE moodle_course_details SET data=? WHERE courseId=?').run(JSON.stringify({sections: [], announcements: [], refreshedAt: new Date(now).toISOString()}), courseA);
  h.replies.core_course_get_contents = contents;
  expect(h.repository.hasCoursePanelCache(courseA, 'sections')).toBe(false);
  await h.call('get_course', {courseId: courseA});
  expect(h.repository.hasCoursePanelCache(courseA, 'sections')).toBe(true);
  const calls = h.request.mock.calls.length;
  await h.call('get_course', {courseId: courseA});
  expect(h.request).toHaveBeenCalledTimes(calls);
});

it('does not certify an empty offline announcement cache after reading undated posts', async () => {
  const h = await setup();
  news(h);
  h.replies.mod_forum_get_forum_discussions = {discussions: [{id: 31, discussion: 30, forum: 11, subject: 'Undated notice'}]};
  expect(JSON.stringify(await h.call('list_announcements', {courseId: courseA}))).toContain('Read chapter two.');
  expect(h.repository.hasCoursePanelCache(courseA, 'announcements')).toBe(false);
  h.repository.expired(accountA);
  await expect(h.call('list_announcements', {courseId: courseA})).rejects.toMatchObject({code: 'SESSION_REQUIRED'});
});
