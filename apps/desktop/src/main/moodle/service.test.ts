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
import { MoodleService } from './service';
import { importMoodleFile, authenticatedFileUrl } from './files';
import { calendarText, startReminders } from './reminders';
import { account, fixtureFetch } from './fixtures/support';
import { ipcContract } from '../../shared/ipc';

const stores: Store[] = [];
const directories: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const store of stores.splice(0)) store.close(); for (const path of directories.splice(0)) rmSync(path,{force:true,recursive:true}); });
async function setup() {
  const directory = mkdtempSync(join(tmpdir(),'moodle-test-')); directories.push(directory);
  const store = openStore(':memory:'); stores.push(store);
  const secrets = createSecretStore(join(directory,'secrets.json'),{isAsyncEncryptionAvailable:async () => true,encryptStringAsync:async value => Buffer.from(value),decryptStringAsync:async value => ({result:value.toString()})});
  const repository = new MoodleRepository(store.db); repository.saveAccount(account);
  await secrets.set(moodleSecretId(account.id),'token');
  const request = fixtureFetch();
  const service = new MoodleService(repository,secrets,{login:async (_school,accept) => accept('token')},request);
  return {directory,store,secrets,repository,request,service};
}
it('syncs twice with stable identities and isolated account records',async () => {
  const {repository,service,store} = await setup();
  await service.sync(account.id);
  const first = repository.overview();
  const course = repository.course(first.courses[0]!.id);
  const reminder = repository.createReminder({deadlineId:course.deadlines[0]!.id,remindAt:'2026-11-06T00:00:00.000Z',note:'Study',createdBy:'user'});
  repository.markRead(course.notifications[0]!.id);
  await service.sync(account.id);
  expect(repository.overview().courses).toEqual(first.courses);
  expect(repository.course(first.courses[0]!.id).reminders).toEqual([reminder]);
  expect(repository.course(first.courses[0]!.id).notifications[0]!.read).toBe(true);
  for (const table of ['courses','notifications','grades','files']) expect(store.db.prepare(`SELECT count(*) AS count FROM moodle_${table}`).get()?.count).toBe(1);
  expect(store.db.prepare('SELECT count(*) AS count FROM moodle_deadlines').get()?.count).toBe(2);
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
  const connected = await service.connect({schoolId:'cycu'});
  expect(connected.id).toBe(account.id);
  expect(Object.keys(connected)).not.toContain('token');
  expect(repository.accounts()).toHaveLength(1);
  expect(await secrets.getInMainOnly(moodleSecretId(account.id))).toBe('token');
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
