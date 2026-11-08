import { nativeTabPool, NATIVE_METRICS_INTERVAL_MS } from '../native-tab-pool';
import { ownerWindow } from '../dialogs';
/**
 * Register validated moodle IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
import { tr } from '../i18n';
import { join } from 'node:path';
import { app, dialog, Notification } from 'electron';
import { moodleChannels } from '../../shared/moodle';
import { moodleProgressChannel,moodleProgressSchema } from '../../shared/ipc';
import type { IpcChannel } from '../../shared/ipc';
import { documentIdSchema } from '../../shared/domain';
import type { Store } from '../db';
import type { SecretStore } from '../services/secrets';
import type { DocumentService } from '../services/documents';
import { exportText } from '../services/export-file';
import type { createIpcRegistrar } from './register';
import { MoodleRepository } from '../moodle/repository';
import { MoodleService } from '../moodle/service';
import { MoodleSso } from '../moodle/sso';
import { MoodleLogoCache } from '../moodle/logos';
import { schools } from '../moodle/schools';
import { importMoodleFile } from '../moodle/files';
import { startReminders, calendarText } from '../moodle/reminders';
import { MoodleWebviews } from '../moodle/webview';
import { tokensSchema } from '../moodle/auth';
import { moodleSecretId } from '../services/secrets';
import { moodleWebviewContract } from '../../shared/moodle-webview';

/** Register this subsystem through the validated IPC registrar; return cleanup for window teardown. */
export function registerMoodleIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, secrets: SecretStore, implemented: Set<IpcChannel>, documents: Pick<DocumentService,'importPath'|'get'>, restoreMainWindow: () => void = () => {}, request?:typeof fetch) {
  const memoryTimer=setInterval(()=>nativeTabPool.evaluate(app.getAppMetrics()),NATIVE_METRICS_INTERVAL_MS);
  const owners=new Set<Electron.WebContents>();
  const repository = new MoodleRepository(store.db);
  const sso = new MoodleSso(restoreMainWindow);
  const webviews = new MoodleWebviews({
    account:id => repository.account(id), file:id => repository.file(id), documents,
    credentials:async id => {
      if (repository.account(id).status !== 'connected') throw new Error('Moodle session expired');
      const raw = await secrets.getInMainOnly(moodleSecretId(id));
      if (!raw) throw new Error('Moodle session expired');
      return tokensSchema.parse(JSON.parse(raw));
    },
  });
  const service = new MoodleService(repository,secrets,sso,request,() => { const language = store.settings.get().language; return language === 'auto' ? app.getLocale() : language === 'zh-Hant' ? 'zh-tw' : language; },event => {for(const owner of owners)if(!owner.isDestroyed())owner.send(moodleProgressChannel,moodleProgressSchema.parse(event));},new MoodleLogoCache(() => join(app.getPath('userData'),'moodle','logos')));

  const stopReminders = startReminders(repository,(title,body) => {
    if (!Notification.isSupported()) return false;
    new Notification({title,body}).show();
    return true;
  });
  for (const channel of Object.values(moodleChannels)) implemented.add(channel);
  for (const channel of Object.keys(moodleWebviewContract) as (keyof typeof moodleWebviewContract)[]) implemented.add(channel);
  registrar.handle('moodle:webview-open',({accountId,target,tabId,checkpoint,importedDocumentId},event) => webviews.open(event.sender,accountId,target,tabId,checkpoint,importedDocumentId));
  registrar.handle('moodle:webview-sync',({tabIds},event)=>{return {ok:true,tabs:webviews.sync(event.sender,tabIds)};});
  registrar.handle('moodle:webview-hide',({tabId,generation},event)=>{webviews.hide(event.sender,tabId,generation);return {ok:true};});
  registrar.handle('moodle:webview-state',({id,tabId},event) => {webviews.assertTab(event.sender,tabId,id);return webviews.state(event.sender,id);});
  registrar.handle('moodle:webview-action',({id,tabId,action},event) => {webviews.assertTab(event.sender,tabId,id);return webviews.action(event.sender,id,action);});
  registrar.handle('moodle:webview-layout',({id,tabId,generation,bounds,theme,visible},event) => {webviews.assertTab(event.sender,tabId,id);webviews.layout(event.sender,id,bounds,theme,visible,generation);return {ok:true};});
  registrar.handle(moodleChannels.schools,() => schools);
  registrar.handle(moodleChannels.checkSite,({url}) => service.checkSite(url));
  registrar.handle(moodleChannels.preflight,async () => {
    try { await secrets.preflight(); return {ready:true}; }
    catch { return {ready:false}; }
  });
  registrar.handle(moodleChannels.retrySave,async ({accountId}) => { await service.retrySave(accountId); return {ok:true}; });
  registrar.handle(moodleChannels.connect,input => service.connect(input));
  registrar.handle(moodleChannels.ssoState,({siteUrl}) => sso.state(siteUrl));
  registrar.handle(moodleChannels.ssoCancel,({siteUrl}) => {sso.cancel(siteUrl);return {ok:true};});
  registrar.handle(moodleChannels.disconnect,async ({accountId}) => { await webviews.disconnect(accountId); await service.disconnect(accountId); return {ok:true}; });
  registrar.handle(moodleChannels.overview,({accountId},event) => {owners.add(event.sender);return service.overview(accountId);});
  registrar.handle(moodleChannels.sync,async ({accountId}) => {
    const accounts = accountId ? [repository.account(accountId)] : repository.accounts();
    const results = await Promise.all(accounts.map(account => service.sync(account.id)));
    return {...repository.overview(accountId),errors:results.flatMap(result => result.errors)};
  });
  registrar.handle(moodleChannels.course,({courseId,refresh}) => service.course(courseId,refresh));
  registrar.handle(moodleChannels.openFile,async ({fileId}) => {
    const {file,account} = repository.file(fileId);
    if (file.documentId && documents.get(documentIdSchema.parse(file.documentId))) return documentIdSchema.parse(file.documentId);
    return documentIdSchema.parse(await importMoodleFile(repository,fileId,account.siteUrl,await service.token(account.id),documents,undefined,join(app.getPath("userData"),"moodle-downloads")));
  });
  registrar.handle(moodleChannels.setPinned,({accountId,courseId,pinned}) => {repository.setPinned(accountId,courseId,pinned);return {ok:true};});
  registrar.handle(moodleChannels.markRead,async ({notificationId,read}) => { await service.markRead(notificationId,read); return {ok:true}; });
  registrar.handle(moodleChannels.createReminder,input => {
    const [deadline] = repository.deadlines([input.deadlineId]);
    if (input.createdBy === 'agent' && (Date.parse(input.remindAt) <= Date.now() || Date.parse(input.remindAt) >= Date.parse(deadline!.dueAt))) throw new Error('Invalid agent reminder time');
    return repository.createReminder(input);
  });
  registrar.handle(moodleChannels.deleteReminder,({reminderId}) => { repository.deleteReminder(reminderId); return {ok:true}; });
  registrar.handle(moodleChannels.exportCalendar,async ({deadlineIds},event) => {
    const text = calendarText(repository.deadlines(deadlineIds));
    const result = await dialog.showSaveDialog(ownerWindow(event.sender), {defaultPath:'vstudy-deadlines.ics',filters:[{name:tr('planner:calendar_file'),extensions:['ics']}]});
    if (result.canceled || !result.filePath) return {saved:false};
    await exportText(text,result.filePath);
    return {saved:true};
  });
  return Object.assign(async () => { clearInterval(memoryTimer); stopReminders(); await webviews.dispose(); sso.dispose(); await service.dispose(); }, {waitForIdle:()=>service.waitForIdle(),service});
}
