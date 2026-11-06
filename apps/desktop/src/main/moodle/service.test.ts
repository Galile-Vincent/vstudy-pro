/**
 * Regression coverage for moodle service.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, type Store } from '../db';
import { createSecretStore, moodleSecretId } from '../services/secrets';
import { DocumentService } from '../services/documents';
import { MoodleRepository } from './repository';
import { AnalyticsService, setAnalytics } from '../analytics/service';
import { MoodleAuthError } from './auth';
import { MoodleService } from './service';
import { importMoodleFile, authenticatedFileUrl } from './files';
import { calendarText, startReminders } from './reminders';
import { account, fixtureFetch } from './fixtures/support';
import { ipcContract } from '../../shared/ipc';

const stores: Store[] = [];
const directories: string[] = [];
afterEach(() => { setAnalytics(undefined);vi.useRealTimers(); for (const store of stores.splice(0)) store.close(); for (const path of directories.splice(0)) rmSync(path,{force:true,recursive:true}); });
async function setup() {
  const directory = mkdtempSync(join(tmpdir(),'moodle-test-')); directories.push(directory);
  const store = openStore(':memory:'); stores.push(store);
  const secrets = createSecretStore(join(directory,'secrets.json'),{isAsyncEncryptionAvailable:async () => true,encryptStringAsync:async value => Buffer.from(value),decryptStringAsync:async value => ({result:value.toString()})});
  const repository = new MoodleRepository(store.db); repository.saveAccount(account);
  await secrets.set(moodleSecretId(account.id),'token');
  const request = fixtureFetch();
  const service = new MoodleService(repository,secrets,{login:async (_site,_provider,accept) => accept({token:'token'})},request);
  return {directory,store,secrets,repository,request,service};
}
it('syncs twice with stable identities and isolated account records',async () => {
  const {repository,service,store} = await setup();
  await service.sync(account.id);
  const first = repository.overview();
  await service.refreshCourse(first.courses[0]!.id);
  const course = repository.course(first.courses[0]!.id);
  const reminder = repository.createReminder({deadlineId:course.deadlines[0]!.id,remindAt:'2026-11-06T00:00:00.000Z',note:'Study',createdBy:'user'});
  repository.markRead(course.notifications[0]!.id);
  await service.sync(account.id);
  expect(repository.overview().courses).toEqual(first.courses);
  expect(repository.course(first.courses[0]!.id).reminders).toEqual([reminder]);
  expect(repository.course(first.courses[0]!.id).notifications[0]!.read).toBe(true);
  for (const table of ['courses','notifications','grades','files']) expect(store.db.prepare(`SELECT count(*) AS count FROM moodle_${table}`).get()?.count).toBe(1);
  expect(store.db.prepare('SELECT count(*) AS count FROM moodle_deadlines').get()?.count).toBe(3);
  const other = {...account,id:randomUUID(),remoteUserId:43}; repository.saveAccount(other);
  expect(repository.overview(other.id)).toMatchObject({courses:[],upcoming:[],unreadNotifications:0});
  await service.disconnect(account.id);
  expect(repository.overview().accounts).toEqual([other]);
  expect(repository.reminders()).toEqual([]);
  await service.dispose();
});
it('returns cached data when offline and expires only the affected account on auth failure',async () => {
  const {repository,request,service} = await setup();
  await service.sync(account.id);
  const cached = repository.overview();
  request.mockRejectedValue(new Error('offline'));
  await service.sync(account.id);
  expect(repository.overview()).toEqual(cached);
  request.mockResolvedValue(Response.json({errorcode:'invalidtoken'}));
  await service.sync(account.id);
  expect(repository.account(account.id).status).toBe('expired');
  expect(repository.overview().courses).toEqual(cached.courses);
  await service.dispose();
});
it('coalesces concurrent sync and rolls back a mismatched snapshot',async () => {
  const {repository,request,service} = await setup();
  await Promise.all([service.sync(account.id),service.sync(account.id)]);
  expect(request.mock.calls.filter(call => String(call[1]?.body).includes('wsfunction=core_webservice_get_site_info'))).toHaveLength(1);
  const courses = repository.overview().courses;
  expect(() => repository.apply(account.id,{courses:[{...courses[0]!,accountId:randomUUID()}],deadlines:[],notifications:[],grades:[],files:[]})).toThrow('account mismatch');
  expect(repository.overview().courses).toEqual(courses);
  await service.dispose();
});
it('uses safeStorage per account without changing provider keys',async () => {
  const {secrets} = await setup();
  await secrets.set('openai-api','provider-key');
  const second = moodleSecretId(randomUUID()); await secrets.set(second,'second-token');
  secrets.delete(moodleSecretId(account.id));
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBeNull();
  expect(await secrets.getInMainOnly(second)).toBe('second-token');
  expect(await secrets.getInMainOnly('openai-api')).toBe('provider-key');
});
it('downloads to a private file, imports through DocumentService, links and deduplicates',async () => {
  const {repository,service,store,directory} = await setup();
  await service.sync(account.id);
  const original = repository.course(repository.overview().courses[0]!.id).files[0]!;
  const documents = new DocumentService({store,userData:directory,convert:async (_input,output) => { await writeFile(output,'# Imported'); return 'markitdown'; }});
  const importedPaths: string[] = [];
  const importPath = vi.spyOn(documents,'importPath').mockImplementation(async path => {
    importedPaths.push(path);
    expect(await readFile(path,'utf8')).toContain('%PDF-');
    return DocumentService.prototype.importPath.call(documents,path);
  });
  const request = vi.fn<typeof fetch>(async () => new Response('%PDF-1.4\nMoodle fixture\n%%EOF'));
  const id = await importMoodleFile(repository,original.id,'https://ilearning.cycu.edu.tw','token',documents,request);
  expect(store.documents.get(id as Parameters<typeof store.documents.get>[0])?.sourceName).toBe('lecture.pdf');
  expect(repository.file(original.id).file.documentId).toBe(id);
  expect(await importMoodleFile(repository,original.id,'https://ilearning.cycu.edu.tw','token',documents,request)).toBe(id);
  expect(request).toHaveBeenCalledTimes(1);
  store.db.prepare('UPDATE moodle_files SET documentId=NULL WHERE id=?').run(original.id);
  expect(await importMoodleFile(repository,original.id,'https://ilearning.cycu.edu.tw','token',documents,request)).toBe(id);
  expect(request).toHaveBeenCalledTimes(2);
  expect(importPath).toHaveBeenCalledTimes(2);
  expect(store.documents.list()).toHaveLength(1);
  expect(new URL(String(request.mock.calls[0]![0])).searchParams.get('token')).toBe('token');
  expect(request.mock.calls[0]![1]?.redirect).toBe('error');
  await expect(access(importedPaths[0]!)).rejects.toThrow();
  await documents.waitForIdle(); documents.dispose(); await service.dispose();
});
it('rejects hostile URLs and oversized downloads before import',async () => {
  for (const target of ['http://ilearning.cycu.edu.tw/pluginfile.php/1/a.pdf','https://evil.example/pluginfile.php/1/a.pdf','https://ilearning.cycu.edu.tw/not-pluginfile.php/a.pdf','https://user@ilearning.cycu.edu.tw/pluginfile.php/1/a.pdf']) expect(() => authenticatedFileUrl(target,'https://ilearning.cycu.edu.tw','token')).toThrow();
  const {repository,service} = await setup(); await service.sync(account.id);
  const file = repository.course(repository.overview().courses[0]!.id).files[0]!;
  const importPath = vi.fn();
  await expect(importMoodleFile(repository,file.id,'https://ilearning.cycu.edu.tw','token',{get:() => null,importPath},async () => new Response('x',{headers:{'content-length':String(50*1024*1024+1)}}))).rejects.toThrow('50 MiB');
  expect(importPath).not.toHaveBeenCalled(); await service.dispose();
});
it('fires overdue reminders once and persists their fired state',async () => {
  const {repository,service} = await setup(); await service.sync(account.id);
  const deadline = repository.overview().upcoming[0]!;
  const reminder = repository.createReminder({deadlineId:deadline.id,remindAt:'2020-01-01T00:00:00.000Z',note:'Study',createdBy:'agent'});
  const notify = vi.fn(() => true);
  const stop = startReminders(repository,notify); stop();
  const stopAgain = startReminders(repository,notify); stopAgain();
  expect(notify).toHaveBeenCalledExactlyOnceWith(deadline.title,'Study');
  expect(repository.reminders()).toEqual([{...reminder,fired:true}]);
  repository.deleteReminder(reminder.id); expect(repository.reminders()).toEqual([]);
  const calendar = calendarText([{...deadline,title:'Study, now;\nNew line'}],'2026-11-01T00:00:00.000Z');
  expect(calendar).toContain('SUMMARY:Study\\, now\\;\\nNew line\r\n');
  expect(calendar).toContain('DTSTAMP:20261101T000000Z\r\n');
  await service.dispose();
});
it('rejects unknown IPC keys and never returns token fields',() => {
  expect(ipcContract['moodle:connect'].request.safeParse({schoolId:'cycu',token:'secret'}).success).toBe(false);
  expect(ipcContract['moodle:open-file'].request.safeParse({fileId:randomUUID(),url:'https://evil.example'}).success).toBe(false);
  expect(ipcContract['moodle:overview'].response.safeParse({accounts:[{...account,token:'secret'}],courses:[],upcoming:[],unreadNotifications:0}).success).toBe(false);
});
it('removes stale rows only after a successful refresh and retains unsupported capability caches',async () => {
  const {repository,service,request} = await setup(); await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  const original = repository.course(course.id);
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction');
    if (name === 'core_course_get_contents' || name === 'gradereport_user_get_grade_items') return Response.json({errorcode:'functionnotavailable'});
    if (name === 'core_message_get_messages') return Response.json({messages:[]});
    return base(target,options);
  });
  await service.sync(account.id);
  expect(repository.course(course.id).files).toEqual(original.files);
  expect(repository.course(course.id).grades).toEqual(original.grades);
  expect(repository.course(course.id).notifications).toEqual([]);
  request.mockImplementation(async (target,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction');
    if (name === 'core_enrol_get_users_courses') return Response.json([]);
    if (name === 'core_course_get_enrolled_courses_by_timeline_classification') return Response.json({courses:[]});
    if (name === 'core_message_get_messages') return Response.json({messages:[]});
    return base(target,options);
  });
  await service.sync(account.id);
  expect(repository.overview().courses).toEqual([]);
  await service.dispose();
});
it('reconnects the existing user account without exposing or duplicating its token',async () => {
  const {repository,service,secrets} = await setup();
  const connected = await service.connect({siteUrl:'https://ilearning.cycu.edu.tw'});
  expect(connected.id).toBe(account.id);
  expect(Object.keys(connected)).not.toContain('token');
  expect(repository.accounts()).toHaveLength(1);
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBe('{"token":"token"}');
  await service.dispose();
});
it('does not link a download after its source revision changes',async () => {
  const {repository,service,store} = await setup(); await service.sync(account.id);
  const file = repository.course(repository.overview().courses[0]!.id).files[0]!;
  const documents = {get:() => null,importPath:vi.fn(async () => {
    store.db.prepare('UPDATE moodle_files SET data=? WHERE id=?').run(JSON.stringify({...file,size:999}),file.id);
    return {id:'22222222-2222-4222-a222-222222222222'} as Awaited<ReturnType<DocumentService['importPath']>>;
  })};
  await importMoodleFile(repository,file.id,'https://ilearning.cycu.edu.tw','token',documents,async () => new Response('pdf'));
  expect(repository.file(file.id).file.documentId).toBe(null);
  await service.dispose();
});
it.each(['nopermissiontoviewgrades','invalidparameter'])('isolates a course access failure %s',async code => {
  const {repository,service,request} = await setup(); await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  const before = repository.course(course.id);
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction');
    if (name === 'gradereport_user_get_grade_items' || name === 'core_course_get_contents') return Response.json({errorcode:code});
    return base(target,options);
  });
  await service.sync(account.id);
  expect(repository.account(account.id).status).toBe('connected');
  expect(repository.course(course.id).grades).toEqual(before.grades);
  expect(repository.course(course.id).files).toEqual(before.files);
  await service.dispose();
});
it('does not expire an account from a single mark-read failure',async () => {
  const {service,repository,request} = await setup(); await service.sync(account.id);
  request.mockResolvedValue(Response.json({errorcode:'requireloginerror'}));
  await service.markRead(repository.notificationRecords(account.id)[0]!.value.id);
  expect(repository.account(account.id).status).toBe('connected');
  await service.dispose();
});
it('retains one orphaned reminder when its deadline vanishes',async () => {
  const {repository,service} = await setup(); await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  const deadline = repository.course(course.id).deadlines[0]!;
  repository.createReminder({deadlineId:deadline.id,remindAt:'2020-01-01T00:00:00.000Z',note:'Keep',createdBy:'user'});
  expect(repository.reminders()).toHaveLength(1);
  repository.apply(account.id,{courses:[course],deadlines:[],notifications:[],grades:[],files:[]});
  expect(repository.reminders()).toHaveLength(1);
  expect(repository.reminders()[0]).toMatchObject({orphaned:true,fired:false});
  const notify = vi.fn(() => true); startReminders(repository,notify)();
  expect(notify).toHaveBeenCalledTimes(0);
  await service.dispose();
});
it('keeps orphaned reminders safe when a whole course leaves enrollment',async () => {
  const {repository,service,request} = await setup(); await service.sync(account.id);
  const deadline = repository.overview().upcoming[0]!;
  repository.createReminder({deadlineId:deadline.id,remindAt:'2020-01-01T00:00:00.000Z',note:'Keep',createdBy:'user'});
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction');
    if (name === 'core_enrol_get_users_courses') return Response.json([]);
    if (name === 'core_course_get_enrolled_courses_by_timeline_classification') return Response.json({courses:[]});
    return base(target,options);
  });
  await service.sync(account.id);
  expect(repository.reminders()).toHaveLength(1);
  expect(repository.reminders()[0]).toMatchObject({orphaned:true,fired:false});
  const notify = vi.fn(() => true); startReminders(repository,notify)();
  expect(notify).toHaveBeenCalledTimes(0);
  await service.dispose();
});
it('surfaces sync failures and backs off automatic retries',async () => {
  const {service,request,repository} = await setup();
  request.mockRejectedValue(new Error('offline'));
  expect(await service.sync(account.id)).toMatchObject({errors:['network']});
  const count = request.mock.calls.length;
  service.overview(); service.overview();
  await Promise.resolve();
  expect(request.mock.calls.length).toBe(count);
  expect(repository.account(account.id).status).toBe('connected');
  await service.dispose();
});
it('applies successful courses when another course fails',async () => {
  const {service,request,repository} = await setup();
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const params = new URLSearchParams(String(options?.body));
    if (params.get('wsfunction') === 'core_enrol_get_users_courses') return Response.json([{id:101,fullname:'One',shortname:'1',startdate:1},{id:102,fullname:'Two',shortname:'2',startdate:1}]);
    if (params.get('courseid') === '101' && params.get('wsfunction') === 'core_course_get_contents') throw new Error('offline');
    return base(target,options);
  });
  expect(await service.sync(account.id)).toMatchObject({errors:['network']});
  expect(repository.overview().courses.map(item => item.fullName).sort()).toEqual(['One','Two']);
  expect(repository.course(repository.overview().courses.find(item => item.remoteId === 102)!.id).files).toHaveLength(1);
  await service.dispose();
});
it('finishes initial sync before connect returns',async () => {
  const {service,repository} = await setup();
  await service.connect({siteUrl:'https://ilearning.cycu.edu.tw'});
  expect(repository.overview().courses).toHaveLength(1);
  expect(repository.course(repository.overview().courses[0]!.id).files[0]!.name).toBe('lecture.pdf');
  await service.dispose();
});
it('retries an offline mark-read on the next sync',async () => {
  const {service,repository,request} = await setup(); await service.sync(account.id);
  const notification = repository.notificationRecords(account.id)[0]!.value;
  const base = request.getMockImplementation()!;
  request.mockRejectedValue(new Error('offline'));
  await service.markRead(notification.id);
  request.mockImplementation(async (target,options) => new URLSearchParams(String(options?.body)).get('wsfunction') === 'core_message_mark_notification_read' ? Response.json({}) : base(target,options));
  request.mockClear();
  await service.sync(account.id);
  expect(request.mock.calls.filter(call => String(call[1]?.body).includes('wsfunction=core_message_mark_notification_read'))).toHaveLength(1);
  expect(repository.notification(notification.id)!.read).toBe(true);
  request.mockClear(); await service.sync(account.id);
  expect(request.mock.calls.filter(call => String(call[1]?.body).includes('wsfunction=core_message_mark_notification_read'))).toHaveLength(0);
  await service.dispose();
});

it('rejects a token issued for a different site before storing it',async () => {
  const {service,request,secrets} = await setup();
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => String(target).includes('server.php') ? Response.json({userid:42,fullname:'Student',siteurl:'https://other.example'}) : base(target,options));
  await expect(service.connect({siteUrl:'https://ilearning.cycu.edu.tw'})).rejects.toMatchObject({code:'requirecorrectaccess'});
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBe('token');
  await service.dispose();
});

it('persists capabilities per account and encrypts the private access key',async () => {
  const {service,request,repository,secrets,store} = await setup();
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    if (String(options?.body).includes('wsfunction=core_webservice_get_site_info')) return Response.json({userid:42,fullname:'Student',siteurl:'https://ilearning.cycu.edu.tw',release:'4.5',version:'2024100700',functions:[{name:'core_enrol_get_users_courses'}],advancedfeatures:[{name:'enablecompletion',value:1}],userprivateaccesskey:'secret-private-key'});
    return base(target,options);
  });
  expect(await service.sync(account.id)).toEqual({errors:[]});
  expect(repository.capabilities(account.id)).toEqual({functions:['core_enrol_get_users_courses'],release:'4.5',version:'2024100700',advancedfeatures:[{name:'enablecompletion',value:1}],mobileConfig:{}});
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBe('{"token":"token","userPrivateAccessKey":"secret-private-key"}');
  expect(JSON.stringify(store.db.prepare('SELECT * FROM moodle_capabilities').all())).not.toContain('secret-private-key');
  expect(request.mock.calls.map(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction'))).toEqual(['core_webservice_get_site_info','core_enrol_get_users_courses']);
  await service.dispose();
});
it.each(['invalidtoken','accessexception'])('expires on %s and avoids repeated background reconnects',async code => {
  const {service,request,repository} = await setup();
  request.mockResolvedValue(Response.json({errorcode:code}));
  expect(await service.sync(account.id)).toEqual({errors:['auth']});
  expect(repository.account(account.id).status).toBe('expired');
  expect(await service.sync(account.id)).toEqual({errors:['auth']});
  expect(request.mock.calls.length).toBe(1);
  await service.dispose();
});
it('refuses a reconnect as a different remote user',async () => {
  const {service,request,repository} = await setup();
  repository.expired(account.id);
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => String(options?.body).includes('wsfunction=core_webservice_get_site_info') ? Response.json({userid:99,fullname:'Other',siteurl:account.siteUrl}) : base(target,options));
  await expect(service.connect({siteUrl:account.siteUrl})).rejects.toMatchObject({code:'requirecorrectaccess'});
  expect(repository.account(account.id).status).toBe('expired');
  await service.dispose();
});

it('offers a browser plan after the password endpoint requires SSO',async () => {
  const {service,request} = await setup();
  request.mockImplementation(async target => String(target).includes('token.php') ? Response.json({errorcode:'ssorequired'}) : Response.json([{error:false,data:{typeoflogin:1,sitename:'School',identityproviders:[{name:'Campus',iconurl:'',url:'https://ilearning.cycu.edu.tw/auth/oauth2/login.php?id=3'}]}}]));
  await expect(service.connect({siteUrl:account.siteUrl,username:'student',password:'secret'})).rejects.toMatchObject({code:'sso-required'});
  expect(await service.checkSite(account.siteUrl)).toMatchObject({siteUrl:'https://ilearning.cycu.edu.tw',siteName:'School',authPlan:{kind:'browser',providers:[{name:'Campus',iconurl:'',url:'https://ilearning.cycu.edu.tw/auth/oauth2/login.php?id=3'}]}});
  await service.dispose();
});

it('stores both SSO tokens in safeStorage without returning them in the account',async () => {
  const {repository,secrets,request} = await setup();
  const service = new MoodleService(repository,secrets,{login:async (_site,_provider,accept) => accept({token:'access',privateToken:'private'})},request);
  expect(await service.connect({siteUrl:account.siteUrl})).toMatchObject({id:'11111111-1111-4111-a111-111111111111',siteUrl:'https://ilearning.cycu.edu.tw',remoteUserId:42,status:'connected'});
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBe('{"token":"access","privateToken":"private"}');
  expect(JSON.stringify(repository.account(account.id))).not.toContain('privateToken');
  await service.dispose();
});
it('keeps the same remote user separate across two schools',async () => {
  const {repository,service} = await setup();
  repository.saveAccount({...account,id:'22222222-2222-4222-a222-222222222222',siteUrl:'https://other.example/moodle',siteName:'Other School'});
  expect(repository.accounts().map(item => ({siteUrl:item.siteUrl,remoteUserId:item.remoteUserId}))).toEqual([{siteUrl:'https://ilearning.cycu.edu.tw',remoteUserId:42},{siteUrl:'https://other.example/moodle',remoteUserId:42}]);
  await service.dispose();
});
it('redacts malformed stored token JSON',async () => {
  const {service,secrets} = await setup();
  await secrets.set(moodleSecretId(account.id),'{moodlemobile://token=CANARY');
  await expect(service.token(account.id)).rejects.toHaveProperty('message','Moodle auth error');
  await service.dispose();
});

it('loads course panels lazily, preserves successful panels on partial failure and isolates accounts',async () => {
  const {repository,service,request} = await setup();
  await service.sync(account.id);
  const course = repository.overview(account.id).courses[0]!;
  repository.saveCourse({...course,identity:{...course.identity,enableCompletion:true}});
  repository.saveCapabilities(account.id,{functions:['core_course_get_contents','core_completion_get_activities_completion_status','mod_forum_get_forums_by_courses','mod_forum_get_forum_discussions'],advancedfeatures:[],mobileConfig:{}});
  const base = request.getMockImplementation()!;
  let contentsFail = false, forumFail = true, contentsRequests = 0;
  request.mockImplementation(async (target,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction');
    if (name === 'core_course_get_contents') {
      contentsRequests++;
      return Response.json(contentsFail ? {errorcode:'failure'} : [{id:1,section:1,name:'Week one',modules:[{id:8,name:'Homework',modname:'assign'}]}]);
    }
    if (name === 'core_completion_get_activities_completion_status') return Response.json({statuses:[{cmid:8,state:1,tracking:1}]});
    if (name === 'mod_forum_get_forums_by_courses') return Response.json(forumFail ? {errorcode:'failure'} : [{id:2,name:'公告',type:'news'}]);
    if (name === 'mod_forum_get_forum_discussions') return Response.json({discussions:[{id:5,name:'Notice',created:1730000000,message:'<p>Read this</p>'}]});
    return base(target,options);
  });
  const pending = service.refreshCourse(course.id);
  await service.course(course.id);
  await pending;
  const first = repository.course(course.id), second = repository.course(course.id);
  expect(contentsRequests).toBe(1);
  expect(first.sections.map(section => section.modules.map(module => [module.name,module.completion]))).toEqual([[['Homework','complete']]]);
  expect(second.sections).toEqual(first.sections);
  expect(first.announcements).toEqual([]);
  expect((await service.course(course.id)).panels).toMatchObject({contents:'idle',completion:'idle',announcements:'error'});
  expect(first.course.progress).toBe(100);
  expect(first.course.identity.hasProgress).toBe(true);
  contentsFail = true; forumFail = false;
  await service.refreshCourse(course.id);
  const updated = repository.course(course.id);
  expect(updated.sections.map(section => section.name)).toEqual(['Week one']);
  expect(updated.announcements.map(item => [item.subject,item.bodyHtml])).toEqual([['Notice','<p>Read this</p>']]);
  const other = {...account,id:randomUUID(),remoteUserId:43}; repository.saveAccount(other);
  expect(repository.overview(other.id).courses).toEqual([]);
  await service.disconnect(account.id);
  expect(() => repository.course(course.id)).toThrow('Moodle course not found');
  await service.dispose();
});

it('skips unadvertised detail capabilities and returns the existing cache',async () => {
  const {repository,service,request} = await setup();
  await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  repository.saveCapabilities(account.id,{functions:[],advancedfeatures:[],mobileConfig:{}});
  request.mockClear();
  const detail = await service.course(course.id);
  expect(detail.course.fullName).toBe('Algorithms');
  expect(detail.sections).toEqual(repository.detailCache(course.id)!.sections);
  expect(request.mock.calls).toEqual([]);
  await service.dispose();
});

it('returns stale panels while a background refresh is still pending',async () => {
  const {repository,service,request,store} = await setup();
  await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  repository.saveCapabilities(account.id,{functions:['core_course_get_contents'],advancedfeatures:[],mobileConfig:{}});
  const base = request.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  request.mockImplementation(async (target,options) => {
    if (new URLSearchParams(String(options?.body)).get('wsfunction') === 'core_course_get_contents') {
      await gate;
      return Response.json([{id:1,section:0,name:'Refreshed',modules:[]}]);
    }
    return base(target,options);
  });
  repository.saveDetail(course.id,{announcements:[]});
  store.db.prepare("UPDATE moodle_course_details SET data=json_set(data,'$.refreshedAt','2000-01-01T00:00:00Z')").run();
  const stale = await service.course(course.id);
  expect(stale.course.fullName).toBe('Algorithms');
  expect(stale.sections).toEqual(repository.detailCache(course.id)!.sections);
  release();
  await service.refreshCourse(course.id);
  expect(repository.course(course.id).sections.map(section => section.name)).toEqual(['Refreshed']);
  await service.dispose();
});

it('publishes sections before slow enrichment and lets a failed fetch retry inside the backoff',async () => {
  const {repository,service,request,store} = await setup();
  await service.sync(account.id);
  const course=repository.overview().courses[0]!;
  store.db.prepare('DELETE FROM moodle_course_details').run();
  repository.saveCapabilities(account.id,{functions:['core_course_get_contents','core_enrol_get_enrolled_users'],advancedfeatures:[],mobileConfig:{}});
  let fail=true, release!:()=>void;
  const gate=new Promise<void>(resolve => {release=resolve;});
  request.mockImplementation(async (_target,options) => {
    const name=new URLSearchParams(String(options?.body)).get('wsfunction');
    if(name === 'core_course_get_contents') return Response.json(fail ? {errorcode:'failure'} : [{id:1,section:1,name:'Visible',modules:[]}]);
    await gate;
    return Response.json([]);
  });
  const failed=await service.course(course.id);
  expect(failed.sections).toEqual([]);
  release();await service.refreshCourse(course.id);
  expect((await service.course(course.id)).fetchState).toBe('error');
  fail=false;
  const retried=await service.course(course.id,true);
  expect(retried.sections.map(section => section.name)).toEqual(['Visible']);
  await service.dispose();
});

it('returns cached overview without starting per-course detail calls',async () => {
  const {service,request}=await setup();
  await service.sync(account.id);
  request.mockClear();
  const started=performance.now();
  const overview=service.overview();
  expect(overview.courses).toHaveLength(1);
  expect(overview.summaries?.[0]?.course.id).toBe(overview.courses[0]!.id);
  expect(request).not.toHaveBeenCalled();
  expect(performance.now()-started).toBeLessThan(100);
  await service.dispose();
});

it('prefetches current contents only and loads historical grades when opened',async () => {
  const {service,repository,request}=await setup();
  const base=request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    if(new URLSearchParams(String(options?.body)).get('wsfunction') === 'core_enrol_get_users_courses') return Response.json([
      {id:101,fullname:'Current',shortname:'C',startdate:1},
      {id:102,fullname:'Past',shortname:'P',enddate:1},
    ]);
    return base(target,options);
  });
  await service.sync(account.id);
  const calls=request.mock.calls.map(call => new URLSearchParams(String(call[1]?.body)));
  expect(calls.filter(args => args.get('wsfunction') === 'core_course_get_contents').map(args => args.get('courseid'))).toEqual(['101']);
  expect(calls.filter(args => args.get('wsfunction') === 'gradereport_user_get_grade_items')).toEqual([]);
  const past=repository.overview().courses.find(course => course.remoteId === 102)!;
  await service.refreshCourse(past.id);
  expect(repository.course(past.id).grades).toHaveLength(1);
  await service.dispose();
});

it('shares negative status results across sync clients and preserves panel failure classes',async () => {
 const {repository,service,request}=await setup();
 const base=request.getMockImplementation()!;
 request.mockImplementation(async (target,options) => {
  const name=new URLSearchParams(String(options?.body)).get('wsfunction');
  if (name === 'mod_quiz_get_user_attempts') return Response.json({errorcode:'accessexception'});
  return base(target,options);
 });
 await service.sync(account.id);
 const count=() => request.mock.calls.filter(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction') === 'mod_quiz_get_user_attempts').length;
 expect(count()).toBe(1);
 await service.sync(account.id);
 expect(count()).toBe(1);
 const course=repository.overview().courses[0]!;
 request.mockImplementation(async (target,options) => {
  if (new URLSearchParams(String(options?.body)).get('wsfunction') === 'core_course_get_contents') return Response.json({errorcode:'accessexception'});
  return base(target,options);
 });
 await service.refreshCourse(course.id);
 expect(await service.course(course.id)).toMatchObject({panels:{contents:'error'},panelErrors:{contents:'permission'}});
 expect(repository.account(account.id).status).toBe('connected');
});

it('preflights before opening SSO, then preserves a slow save and retries once', async () => {
  vi.useFakeTimers();
  const {repository,secrets,request} = await setup();
  const preflight = vi.spyOn(secrets,'preflight').mockResolvedValue();
  const original = secrets.set.bind(secrets);
  let release!: () => void;
  const saving = new Promise<void>(resolve => {release = resolve;});
  const set = vi.spyOn(secrets,'set').mockImplementationOnce(async () => {
    await saving;
    throw new Error('denied');
  }).mockImplementation(original);
  const login = vi.fn(async (_site,_provider,accept) => {
    expect(preflight).toHaveBeenCalledTimes(1);
    return accept({token:'verified-token',privateToken:'private'});
  });
  const service = new MoodleService(repository,secrets,{login},request);
  let finished = false;
  const connecting = service.connect({siteUrl:account.siteUrl}).then(value => {finished=true;return value;});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(finished).toBe(false);
  expect(await service.token(account.id)).toBe('verified-token');
  expect(repository.account(account.id).status).toBe('connected');
  release();
  const result = await connecting;
  expect(result.status).toBe('connected');
  expect(result.signInStorage).toBeUndefined();
  expect(set).toHaveBeenCalledTimes(2);
  await service.dispose();
});
it('retains login after both save attempts fail and retries without another login', async () => {
  const {service,secrets,repository} = await setup();
  const original = secrets.set.bind(secrets);
  const set = vi.spyOn(secrets,'set').mockRejectedValue(new Error('denied'));
  const result = await service.connect({siteUrl:account.siteUrl});
  expect(result).toMatchObject({status:'connected',signInStorage:'unsaved'});
  expect(set).toHaveBeenCalledTimes(2);
  expect(await service.token(result.id)).toBe('token');
  expect(service.overview().accounts[0]?.signInStorage).toBe('unsaved');
  set.mockImplementation(original);
  await service.retrySave(result.id);
  expect(service.overview().accounts[0]?.signInStorage).toBeUndefined();
  expect(repository.accounts()).toHaveLength(1);
  await service.dispose();
});
it('connects in memory only after an explicit session choice', async () => {
  const {service,secrets} = await setup();
  const preflight = vi.spyOn(secrets,'preflight').mockRejectedValue(new Error('unavailable'));
  await expect(service.connect({siteUrl:account.siteUrl})).rejects.toThrow('unavailable');
  const set = vi.spyOn(secrets,'set');
  const result = await service.connect({siteUrl:account.siteUrl,storage:'session'});
  expect(result.signInStorage).toBe('session');
  expect(preflight).toHaveBeenCalledTimes(1);
  expect(set).not.toHaveBeenCalled();
  expect(secrets.has(moodleSecretId(result.id))).toBe(false);
  expect(await service.token(result.id)).toBe('token');
  await service.dispose();
});

it('routes a selected alternate identity provider through SSO instead of the password endpoint',async () => {
  const {repository,secrets,request,service:initial}=await setup();
  await initial.dispose();
  const transport=request.getMockImplementation()!;
  request.mockImplementation(async (url,options) => String(url).includes('service-nologin.php') ? Response.json([{error:false,data:{typeoflogin:1,identityproviders:[{name:'Campus ID',iconurl:'',url:`${account.siteUrl}/auth/oauth2/login.php?id=3`}]}}]) : transport(url,options));
  const used:number[]=[];
  const service=new MoodleService(repository,secrets,{login:async (site,provider,accept) => {
    expect(site.authPlan).toMatchObject({kind:'browser',providers:[{name:'Campus ID'}]});
    used.push(provider!);return accept({token:'token'});
  }},request);
  try {
    expect(await service.connect({siteUrl:account.siteUrl,provider:0})).toMatchObject({id:account.id,status:'connected'});
    expect(used).toEqual([0]);
    expect(request.mock.calls.some(call => String(call[0]).includes('/login/token.php'))).toBe(false);
  } finally {await service.dispose();}
});

it('hydrates a verified school from restored connections and sync without reconnecting',async()=>{
  const {store,repository,secrets,request}=await setup();
  const analytics=new AnalyticsService(store.db,{enabled:true,host:'https://example.org',key:'test'},{app_version:'0.3.0',platform:'macos'});
  setAnalytics(analytics);const school=vi.spyOn(analytics,'school');
  const service=new MoodleService(repository,secrets,{login:async()=>{throw new Error('must not reconnect');}},request);
  expect(school).toHaveBeenCalledWith({id:'cycu',name:'Chung Yuan Christian University'});
  school.mockClear();await service.sync(account.id);
  expect(school).toHaveBeenCalledWith({id:'cycu',name:'Chung Yuan Christian University'});
  expect(JSON.parse(String(store.db.prepare("SELECT value FROM analytics_state WHERE key='school_profile'").get()!.value))).toMatchObject({moodle_connected:true,school_id:'cycu'});
  await service.dispose();
});
it('reports cancelled login separately and never reports success followed by failure',async()=>{
  const {store,repository,secrets,request}=await setup();
  const analytics=new AnalyticsService(store.db,null,{app_version:'0.3.0',platform:'macos'});setAnalytics(analytics);
  const track=vi.spyOn(analytics,'track');
  const service=new MoodleService(repository,secrets,{login:async()=>{throw new MoodleAuthError('cancelled');}},request);
  await expect(service.connect({siteUrl:account.siteUrl,storage:'session'})).rejects.toThrow();
  expect(track.mock.calls.map(c=>c[0])).toEqual(['moodle_connection_started','moodle_connection_cancelled']);
  track.mockClear();
  const failed=new MoodleService(repository,secrets,{login:async(_site,_provider,accept)=>accept({token:'token'})},request);
  vi.spyOn(repository,'saveCapabilities').mockImplementation(()=>{throw new Error('storage failed');});
  await expect(failed.connect({siteUrl:account.siteUrl,storage:'session'})).rejects.toThrow();
  expect(track.mock.calls.map(c=>c[0])).toEqual(['moodle_connection_started','moodle_connection_failed']);
  await service.dispose();await failed.dispose();
});

it('keeps local unread across server sync without writing unread to Moodle',async () => {
  const {service,repository,request,store} = await setup();
  await service.sync(account.id);
  const notification = repository.notificationRecords(account.id)[0]!.value;
  await service.markRead(notification.id);
  request.mockClear();
  await service.markRead(notification.id,false);
  expect(request).not.toHaveBeenCalled();
  expect(new MoodleRepository(store.db).notification(notification.id)).toMatchObject({read:false,localUnread:true,pendingRemoteRead:false});
  await service.sync(account.id);
  expect(repository.notification(notification.id)).toMatchObject({read:false,localUnread:true});
  expect(repository.notification(notification.id)?.pendingRemoteRead).not.toBe(true);
  expect(request.mock.calls.some(call => String(call[1]?.body).includes('wsfunction=core_message_mark_notification_read'))).toBe(false);
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => new URLSearchParams(String(options?.body)).get('wsfunction') === 'core_message_mark_notification_read' ? Response.json({}) : base(target,options));
  await service.markRead(notification.id);
  expect(repository.notification(notification.id)).toMatchObject({read:true,localUnread:false,pendingRemoteRead:false});
  await service.dispose();
});

it('persists local pins across sync and reopening, scopes them to the account, and removes vanished courses', async () => {
  const {repository,service,directory} = await setup();
  await service.sync(account.id);
  const course = repository.overview().courses[0]!;
  repository.setPinned(account.id,course.id,true);
  repository.setPinned(account.id,course.id,true);
  await service.sync(account.id);
  expect(repository.overview().pinnedCourseIds).toEqual([course.id]);
  const other = {...account,id:randomUUID(),remoteUserId:400};repository.saveAccount(other);
  expect(() => repository.setPinned(other.id,course.id,true)).toThrow('Moodle course not found');
  expect(repository.overview(other.id).pinnedCourseIds).toEqual([]);
  const filename = join(directory,'pin-persistence.sqlite');
  const disk = openStore(filename);stores.push(disk);
  const local = new MoodleRepository(disk.db);local.saveAccount(account);
  const snapshot = {courses:[course],deadlines:[],notifications:[],grades:[],files:[]};
  local.apply(account.id,snapshot);local.setPinned(account.id,course.id,true);
  disk.settings.set({...disk.settings.get(),coursesSort:{current:'name',all:'name'}});
  disk.close();stores.splice(stores.indexOf(disk),1);
  const reopened = openStore(filename);stores.push(reopened);
  const restored = new MoodleRepository(reopened.db);
  expect(restored.overview().pinnedCourseIds).toEqual([course.id]);
  expect(reopened.settings.get().coursesSort).toEqual({current:'name',all:'name'});
  restored.apply(account.id,snapshot);
  expect(restored.overview().pinnedCourseIds).toEqual([course.id]);
  restored.setPinned(account.id,course.id,false);expect(restored.overview().pinnedCourseIds).toEqual([]);
  restored.setPinned(account.id,course.id,true);
  restored.apply(account.id,{...snapshot,courses:[]});
  expect(restored.overview().pinnedCourseIds).toEqual([]);
  expect(reopened.db.prepare('SELECT count(*) AS count FROM moodle_course_pins').get()?.count).toBe(0);
  await service.dispose();
});
