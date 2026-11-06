/** Isolated SQLite, school responses and main-only secrets for backend behavior tests. @packageDocumentation */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { openStore } from '../db';
import { MoodleRepository } from '../moodle/repository';
import { MoodleService } from '../moodle/service';
import { createSecretStore, moodleSecretId } from '../services/secrets';
import { remoteId } from '../moodle/remote-id';
import { PlannerRepository } from '../planner/repository';
import { SearchService } from '../services/search';
import { emptyCourseIdentity, type MoodleModule } from '../../shared/moodle-course';
import { documentSchema } from '../../shared/domain';
import type { MoodleCourse } from '../../shared/moodle';
import type { McpBackendOptions } from './backend-types';

export const accountA = '11111111-1111-4111-a111-111111111111';
export const accountB = '22222222-2222-4222-a222-222222222222';
export const courseA = remoteId(accountA, 'course', 10);
export const courseB = remoteId(accountB, 'course', 20);
export const moduleA = remoteId(accountA, 'module', 101);
export const assignA = remoteId(accountA, 'module', 102);
export const fileA = remoteId(accountA, 'file', 201);
export const fileB = remoteId(accountB, 'file', 202);
export const now = Date.parse('2026-11-06T00:00:00.000Z');
const stamp = new Date(now).toISOString();

export function moduleRecord(id = moduleA, cmid = 101, kind:MoodleModule['kind'] = 'resource'): MoodleModule {
  return {id, cmid, kind, modname:kind, name:'Course material', descriptionHtml:'<p>Study the <a href="https://school.test/private?token=secret">course</a>.</p>', url:'https://school.test/mod/resource/view.php?id=101', accessible:true, completion:'incomplete', dueAt:null, submitted:null, fileIds:[fileA]};
}

export async function backendHarness() {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-backend-'));
  const store = openStore(':memory:');
  const repository = new MoodleRepository(store.db);
  const secrets = createSecretStore(join(directory, 'secrets.json'), {isAsyncEncryptionAvailable:async () => true, encryptStringAsync:async value => Buffer.from(value), decryptStringAsync:async value => ({result:value.toString()})});
  const functions = [
    'core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents',
    'core_calendar_get_calendar_upcoming_view', 'mod_forum_get_forums_by_courses',
    'mod_forum_get_forum_discussions', 'mod_forum_get_forum_discussions_paginated', 'mod_forum_get_discussion_posts',
    'gradereport_user_get_grade_items', 'mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts',
    'core_enrol_get_enrolled_users', 'core_course_get_course_module',
    'core_completion_update_activity_completion_status_manually', 'mod_forum_add_discussion_post',
    'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'mod_assign_save_submission', 'mod_assign_submit_for_grading',
  ];
  for (const [id, remote, courseId, courseRemote, fileId] of [[accountA, 7, courseA, 10, fileA], [accountB, 8, courseB, 20, fileB]] as const) {
    repository.saveAccount({id, siteUrl:'https://school.test', siteName:'Fixture university', remoteUserId:remote, displayName:'Student', status:'connected', syncedAt:stamp});
    secrets.useInSession(moodleSecretId(id), 'school-token-' + id);
    repository.saveCapabilities(id, {functions:[...functions], advancedfeatures:[], mobileConfig:{}});
    const course:MoodleCourse = {id:courseId, accountId:id, remoteId:courseRemote, fullName:id === accountA ? 'Algorithms' : 'Private history', shortName:'Course', imageUrl:null, progress:50, startAt:null, endAt:null, favourite:false, identity:emptyCourseIdentity('Course')};
    repository.apply(id, {courses:[course], deadlines:[], notifications:[], grades:[], files:[]});
    repository.saveDetail(courseId, {sections:[{id:randomUUID(), number:1, name:'Week one', summaryHtml:'<p>Algorithm foundations</p>', accessible:true, current:true, weekStart:null, modules:id === accountA ? [moduleRecord(), moduleRecord(assignA, 102, 'assign')] : [{...moduleRecord(remoteId(id, 'module', 201), 201), fileIds:[fileB]}]}]}, [
      {url:'https://school.test/pluginfile.php/secret?token=hidden', value:{id:fileId, courseId, section:'Week one', module:'Course material', name:'lecture.md', mime:'text/markdown', size:100, modifiedAt:stamp, documentId:null}},
    ], stamp);
  }
  const replies:Record<string, unknown> = {};
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const params = new URLSearchParams(String(init?.body));
    const name = params.get('wsfunction')!;
    if (name === 'mod_assign_save_submission' && Array.isArray(replies[name]) && !replies[name].length) {
      const status = structuredClone(replies.mod_assign_get_submission_status) as {lastattempt?:{submission?:{plugins:unknown[]}}};
      if (status?.lastattempt?.submission) status.lastattempt.submission.plugins = [{type:'onlinetext', editorfields:[{name:'onlinetext', text:params.get('plugindata[onlinetext_editor][text]'), format:2}]}];
      replies.mod_assign_get_submission_status = status;
    }
    return Response.json(replies[name] ?? {exception:'missing fixture', errorcode:'functionnotavailable'});
  });
  const moodle = new MoodleService(repository, secrets, {login:async () => { throw new Error('No login'); }}, request);
  const planner = new PlannerRepository(store.db, () => now);
  const read = vi.fn(async () => '# Algorithms\nConverted content');
  const openModule = vi.fn(async () => {});
  const exportCalendar = vi.fn(async () => ({saved:true}));
  const waits:number[] = [];
  let time = now;
  const options:McpBackendOptions = {store, moodle, planner, documents:{read}, openModule, exportCalendar, clock:() => time, random:() => 0, wait:async ms => { waits.push(ms); time += ms; }};
  function document(fileId = fileA, content = 'Converted algorithms text') {
    const record = repository.file(fileId).file;
    const item = documentSchema.parse({id:randomUUID(), title:'Lecture', sourceName:'lecture.md', sourceHash:createHash('sha256').update(fileId).digest('hex'), sourcePath:'/main-only/lecture.md', mime:'text/markdown', markdownPath:'/main-only/content.md', status:'ready', createdAt:stamp, converter:'markitdown'});
    store.documents.insert(item);
    new SearchService(store.db).update(item.id, content);
    repository.linkFile(fileId, item.id, record);
    return item;
  }
  return {options, store, repository, moodle, planner, secrets, replies, request, read, openModule, exportCalendar, waits, document, setTime:(value:number) => { time = value; }, close:async () => { await moodle.dispose(); store.close(); rmSync(directory, {recursive:true, force:true}); }};
}
