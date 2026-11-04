import { moodleFetch } from './site-url';
import { randomUUID } from 'node:crypto';
import type { MoodleAccount, MoodleSchool } from '../../shared/moodle';
import type { SecretStore } from '../services/secrets';
import { moodleSecretId } from '../services/secrets';
import { MoodleClient, MoodleError, passwordToken, plainText, type Fetch } from './client';
import { MoodleRepository } from './repository';
import { checkSite } from './discovery';

export class MoodleService {
  private readonly pending = new Map<string,Promise<{errors:string[]}>>();
  private stopped = false;
  private readonly lastAttempt = new Map<string,number>();
  constructor(readonly repository: MoodleRepository, private readonly secrets: SecretStore, private readonly sso: {login(school: MoodleSchool, accept: (token: string) => Promise<MoodleAccount>):Promise<MoodleAccount>}, private readonly request: Fetch = moodleFetch) {}
  private readonly connecting = new Set<string>();
  async checkSite(url: string) {
    const {config: _config,...result} = await checkSite(url,this.request);
    return result;
  }
  async connect(input: {siteUrl:string;provider?:number | undefined;username?:string | undefined;password?:string | undefined}): Promise<MoodleAccount> {
    const checked = await checkSite(input.siteUrl,this.request);
    const school: MoodleSchool = {id:'site',host:checked.siteUrl,name:checked.siteName,login:checked.authPlan.kind === 'password' ? 'password' : 'sso-launch'};
    if (checked.authPlan.kind === 'unavailable') throw new Error(checked.authPlan.reason);
    if (this.stopped || this.connecting.has(school.host)) throw new Error('Moodle login unavailable');
    if (school.login === 'sso-launch' && (input.username !== undefined || input.password !== undefined)) throw new Error('Site requires SSO');
    this.connecting.add(school.host);
    try {
      return school.login === 'sso-launch'
        ? await this.sso.login(school,token => this.acceptToken(school,token))
        : await this.acceptToken(school,await passwordToken(school.host,input.username ?? '',input.password ?? '',this.request));
    } finally { this.connecting.delete(school.host); }
  }
  private async acceptToken(school: MoodleSchool, token: string): Promise<MoodleAccount> {
    const info = await new MoodleClient(school.host,token,this.request).siteInfo();
    if (this.stopped) throw new Error('Moodle service closed');
    const existing = this.repository.accounts().find(account => account.siteUrl === school.host && account.remoteUserId === info.userid);
    const account: MoodleAccount = {id:existing?.id ?? randomUUID(),siteUrl:school.host,siteName:school.name,remoteUserId:info.userid,displayName:plainText(info.fullname),status:'connected',syncedAt:existing?.syncedAt ?? null};
    await this.secrets.set(moodleSecretId(account.id),token);
    if (this.stopped || existing && !this.repository.accounts().some(row => row.id === existing.id)) {
      this.secrets.delete(moodleSecretId(account.id));
      throw new Error('Moodle login cancelled');
    }
    this.repository.saveAccount(account);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([this.sync(account.id),new Promise<void>(resolve => { timer = setTimeout(resolve,30_000); })]); }
    finally { clearTimeout(timer); }
    return this.repository.account(account.id);
  }
  async disconnect(id: string) {
    this.repository.account(id);
    this.repository.disconnect(id);
    this.secrets.delete(moodleSecretId(id));
    await this.pending.get(id);
  }
  overview(accountId?: string) {
    const snapshot = this.repository.overview(accountId);
    for (const account of snapshot.accounts) if (account.status === 'connected' && Date.now() - (this.lastAttempt.get(account.id) ?? 0) >= 60_000 && (!account.syncedAt || Date.now() - Date.parse(account.syncedAt) > 5 * 60_000)) void this.sync(account.id);
    return snapshot;
  }
  async token(id: string): Promise<string> {
    const token = await this.secrets.getInMainOnly(moodleSecretId(id));
    if (!token) throw new MoodleError('auth');
    return token;
  }
  async markRead(id: string) {
    const item = this.repository.notification(id);
    if (!item) throw new Error('Moodle notification not found');
    this.repository.markRead(id);
    const account = this.repository.account(item.accountId);
    const remote = this.repository.notificationRecords(account.id).find(row => row.value.id === id)!;
    try { await new MoodleClient(account.siteUrl,await this.token(account.id),this.request).markRead(remote.remoteId); this.repository.acknowledgeRead(id); }
    catch { /* Keep the pending remote read for the next sync. */ }
  }
  sync(id: string): Promise<{errors:string[]}> {
    if (this.stopped) return Promise.resolve({errors:[]});
    const current = this.pending.get(id);
    if (current) return current;
    this.lastAttempt.set(id,Date.now());
    const work = this.refresh(id).catch(error => {
      if (error instanceof MoodleError && error.kind === 'auth' && this.repository.accounts().some(account => account.id === id)) this.repository.expired(id);
      return {errors:[error instanceof MoodleError ? error.kind : 'service']};
    }).finally(() => this.pending.delete(id));
    this.pending.set(id,work);
    return work;
  }
  private async refresh(id: string) {
    const account = this.repository.account(id);
    const client = new MoodleClient(account.siteUrl,await this.token(id),this.request);
    const info = await client.siteInfo();
    if (info.userid !== account.remoteUserId) throw new MoodleError('auth');
    for (const row of this.repository.notificationRecords(id).filter(row => row.value.pendingRemoteRead)) {
      try { await client.markRead(row.remoteId); this.repository.acknowledgeRead(row.value.id); } catch { /* Retry on the next sync. */ }
    }
    const courses = await client.courses(account);
    const errors: string[] = [];
    const optional = async <T>(request: () => Promise<T>, cached: T): Promise<T> => {
      try { return await request(); } catch (error) { errors.push(error instanceof MoodleError ? error.kind : 'service'); return cached; }
    };
    const cached = courses.flatMap(course => { try { return [this.repository.course(course.id)]; } catch { return []; } });
    const events = await optional(() => client.events(id,courses),cached.flatMap(item => item.deadlines.filter(item => item.kind !== 'assignment')));
    const notifications = await optional(() => client.notifications(account,courses),this.repository.notificationRecords(id).map(row => ({...row,value:{...row.value,courseId:courses.some(course => course.id === row.value.courseId) ? row.value.courseId : null}})));
    const active = () => !this.stopped && this.repository.accounts().some(account => account.id === id);
    for (const course of courses) {
      const assignments = await optional(() => client.assignments(id,[course]),cached.find(item => item.course.id === course.id)?.deadlines.filter(item => item.kind === 'assignment') ?? []);
      const grades = await optional(() => client.grades(course,account.remoteUserId),this.repository.gradeRecords(course.id));
      const files = await optional(() => client.files(course),this.repository.fileRecords(course.id));
      const matches = (event: typeof events[number]) => assignments.some(assignment => assignment.courseId === event.courseId && (assignment.url === event.url && event.url !== null || assignment.title === event.title && assignment.dueAt === event.dueAt));
      const deadlines = [...assignments,...events.filter(event => event.courseId === course.id && !matches(event))];
      if (active()) {
        try { this.repository.apply(id,{courses:[course],deadlines,notifications:[],grades,files},course.id); }
        catch { errors.push('service'); }
      }
    }
    if (active()) this.repository.apply(id,{courses,deadlines:[],notifications,grades:[],files:[]},'@notifications');
    return {errors};
  }

  async dispose() { this.stopped = true; await Promise.allSettled(this.pending.values()); }
}
