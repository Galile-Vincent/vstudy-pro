import { dialog, Notification } from 'electron';
import { moodleChannels } from '../../shared/moodle';
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
import { schools } from '../moodle/schools';
import { importMoodleFile } from '../moodle/files';
import { startReminders, calendarText } from '../moodle/reminders';

export function registerMoodleIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, secrets: SecretStore, implemented: Set<IpcChannel>, documents: Pick<DocumentService,'importPath'|'get'>, restoreMainWindow: () => void = () => {}) {
  const repository = new MoodleRepository(store.db);
  const sso = new MoodleSso(restoreMainWindow);
  const service = new MoodleService(repository,secrets,sso);
  const stopReminders = startReminders(repository,(title,body) => {
    if (!Notification.isSupported()) return false;
    new Notification({title,body}).show();
    return true;
  });
  for (const channel of Object.values(moodleChannels)) implemented.add(channel);
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
  registrar.handle(moodleChannels.disconnect,async ({accountId}) => { await service.disconnect(accountId); return {ok:true}; });
  registrar.handle(moodleChannels.overview,({accountId}) => service.overview(accountId));
  registrar.handle(moodleChannels.sync,async ({accountId}) => {
    const accounts = accountId ? [repository.account(accountId)] : repository.accounts();
    const results = await Promise.all(accounts.map(account => service.sync(account.id)));
    return {...repository.overview(accountId),errors:results.flatMap(result => result.errors)};
  });
  registrar.handle(moodleChannels.course,({courseId}) => { const detail = repository.course(courseId); service.overview(detail.course.accountId); return detail; });
  registrar.handle(moodleChannels.openFile,async ({fileId}) => {
    const {file,account} = repository.file(fileId);
    if (file.documentId && documents.get(documentIdSchema.parse(file.documentId))) return documentIdSchema.parse(file.documentId);
    return documentIdSchema.parse(await importMoodleFile(repository,fileId,account.siteUrl,await service.token(account.id),documents));
  });
  registrar.handle(moodleChannels.markRead,async ({notificationId}) => { await service.markRead(notificationId); return {ok:true}; });
  registrar.handle(moodleChannels.createReminder,input => {
    const [deadline] = repository.deadlines([input.deadlineId]);
    if (input.createdBy === 'agent' && (Date.parse(input.remindAt) <= Date.now() || Date.parse(input.remindAt) >= Date.parse(deadline!.dueAt))) throw new Error('Invalid agent reminder time');
    return repository.createReminder(input);
  });
  registrar.handle(moodleChannels.deleteReminder,({reminderId}) => { repository.deleteReminder(reminderId); return {ok:true}; });
  registrar.handle(moodleChannels.exportCalendar,async ({deadlineIds}) => {
    const text = calendarText(repository.deadlines(deadlineIds));
    const result = await dialog.showSaveDialog({defaultPath:'vstudy-deadlines.ics',filters:[{name:'Calendar',extensions:['ics']}]});
    if (result.canceled || !result.filePath) return {saved:false};
    await exportText(text,result.filePath);
    return {saved:true};
  });
  return async () => { stopReminders(); sso.dispose(); await service.dispose(); };
}
