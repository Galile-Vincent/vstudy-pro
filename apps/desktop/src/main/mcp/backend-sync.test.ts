/** Exercise real sync cache effects, page API matching, stable resource links and cooldown boundaries. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import { createMcpBackend } from './backend';
import { backendHarness, accountA, courseA, moduleA, now } from './backend-test-support';
import { mcpTools } from '../../shared/mcp';
import { moduleReference } from './backend-references';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.close(); });
async function setup() {
  const h = await backendHarness(); harnesses.push(h);
  const functions = h.repository.capabilities(accountA)!.functions!.filter(name => !['mod_assign_get_assignments', 'mod_quiz_get_quizzes_by_courses', 'core_calendar_get_calendar_upcoming_view'].includes(name));
  functions.push('mod_page_get_pages_by_courses');
  h.repository.saveCapabilities(accountA, {functions, advancedfeatures:[], mobileConfig:{}});
  Object.assign(h.replies, {
    core_webservice_get_site_info:{userid:'7', siteurl:'https://school.test', functions:functions.map(name => ({name}))},
    core_enrol_get_users_courses:[{id:'10', fullname:'Fresh algorithms', shortname:'Algorithms'}],
    core_course_get_contents:[{id:1, name:'Week', section:1, summary:'Course text', visible:1, modules:[{id:101, name:'Lecture', modname:'page', instance:201, url:'https://school.test/mod/page/view.php?id=101', visible:1, uservisible:true, description:'Intro only'}]}],
    mod_page_get_pages_by_courses:{pages:[{id:'201', course:'10', coursemodule:'101', name:'Lecture', content:'<h2>Full algorithms chapter</h2><p>Dynamic programming. <a href="/mod/page/view.php?id=101">Open this module</a></p><script>steal()</script>'}], warnings:[]},
  });
  return {...h, backend:createMcpBackend(h.options)};
}

it('syncs course and full page text using spaced read calls with no notification or assessment writes', async () => {
  const h = await setup();
  const sync = await h.backend.prepare('sync_now', mcpTools.sync_now.schema.parse({}), [accountA]);
  expect(h.request).not.toHaveBeenCalled();
  expect((await sync.execute()).content).toMatchObject({synced:true, courseCount:1});
  expect(h.repository.course(courseA).course.fullName).toBe('Fresh algorithms');
  expect(h.repository.course(courseA).sections[0]!.modules[0]!.descriptionHtml).toContain('Dynamic programming');
  const names = h.request.mock.calls.map(row => new URLSearchParams(String(row[1]?.body)).get('wsfunction'));
  expect(names).toEqual(['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents', 'mod_page_get_pages_by_courses']);
  expect(h.waits).toEqual([250, 250, 250]);
  const search = mcpTools.search_content.schema.parse({query:'Dynamic programming'});
  const result = await (await h.backend.prepare('search_content', search, [accountA])).execute();
  expect(JSON.stringify(result)).toContain(moduleA);
});

it('enforces a sixty-second account sync cooldown including concurrent starts', async () => {
  const h = await setup();
  const args = mcpTools.sync_now.schema.parse({});
  const first = await h.backend.prepare('sync_now', args, [accountA]);
  const second = await h.backend.prepare('sync_now', args, [accountA]);
  const active = first.execute();
  await expect(second.execute()).rejects.toMatchObject({code:'RATE_LIMITED'});
  await active;
  h.setTime(now + 59_999);
  await expect((await h.backend.prepare('sync_now', args, [accountA])).execute()).rejects.toMatchObject({code:'RATE_LIMITED'});
  h.setTime(now + 60_000);
  expect((await (await h.backend.prepare('sync_now', args, [accountA])).execute()).content).toMatchObject({synced:true});
});

it('verifies school identity before accepting sync output or capabilities', async () => {
  const h = await setup();
  h.replies.core_webservice_get_site_info = {userid:8, siteurl:'https://school.test', functions:[]};
  await expect((await h.backend.prepare('sync_now', mcpTools.sync_now.schema.parse({}), [accountA])).execute()).rejects.toMatchObject({code:'DENIED'});
  expect(h.repository.course(courseA).course.fullName).toBe('Algorithms');
  expect(h.request).toHaveBeenCalledTimes(1);
});

it('reads full pages by course and cmid, rewrites known links and reuses the cache offline', async () => {
  const h = await setup();
  const detail = h.repository.course(courseA);
  h.repository.saveDetail(courseA, {sections:detail.sections.map(section => ({...section, modules:section.modules.map(module => module.id === moduleA ? {...module, kind:'page', modname:'page', url:'https://school.test/mod/page/view.php?id=101', descriptionHtml:'Intro only'} : module)}))});
  const args = mcpTools.get_module.schema.parse({courseId:courseA, moduleId:moduleA});
  const result = await (await h.backend.prepare('get_module', args, [accountA])).execute();
  expect(result.content).toMatchObject({module:{id:moduleA, reference:moduleReference(accountA, courseA, moduleA)}});
  expect(JSON.stringify(result)).toContain('Full algorithms chapter');
  expect(JSON.stringify(result)).toContain('Dynamic programming');
  expect(JSON.stringify(result)).toContain(moduleReference(accountA, courseA, moduleA));
  expect(JSON.stringify(result)).not.toMatch(/https|<script>|steal\(\)/);
  h.repository.expired(accountA); h.request.mockClear();
  const cached = await (await h.backend.prepare('get_module', args, [accountA])).execute();
  expect(JSON.stringify(cached)).toContain('Dynamic programming');
  expect(h.request).not.toHaveBeenCalled();
});

it('rejects a page response with a foreign course or different module and does not cache its body', async () => {
  const h = await setup();
  const detail = h.repository.course(courseA);
  h.repository.saveDetail(courseA, {sections:detail.sections.map(section => ({...section, modules:section.modules.map(module => ({...module, kind:'page', modname:'page'}))}))});
  h.replies.mod_page_get_pages_by_courses = {pages:[{id:201, course:20, coursemodule:101, content:'Private chapter'}]};
  await expect((await h.backend.prepare('get_module', mcpTools.get_module.schema.parse({courseId:courseA, moduleId:moduleA}), [accountA])).execute()).rejects.toMatchObject({code:'DENIED'});
  expect(JSON.stringify(h.repository.course(courseA).sections)).not.toContain('Private chapter');
});
