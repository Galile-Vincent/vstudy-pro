import { randomUUID } from 'node:crypto';
import type { MoodleAccount, MoodleSchool } from '../../shared/moodle';
import type { SecretStore } from '../services/secrets';
import { moodleSecretId } from '../services/secrets';
import { MoodleClient, MoodleError, passwordToken, plainText, type Fetch } from './client';
import { MoodleRepository } from './repository';
import { schoolById } from './schools';

export class MoodleService {
  private readonly pending = new Map<string,Promise<void>>();
  private stopped = false;
  constructor(readonly repository: MoodleRepository, private readonly secrets: SecretStore, private readonly sso: {login(school: MoodleSchool, accept: (token: string) => Promise<MoodleAccount>):Promise<MoodleAccount>}, private readonly request: Fetch = fetch) {}
  private readonly connecting = new Set<string>();
  async connect(input: {schoolId:string;username?:string | undefined;password?:string | undefined}): Promise<MoodleAccount> {
    const school = schoolById(input.schoolId);
    if (this.stopped || this.connecting.has(school.id)) throw new Error('Moodle login unavailable');
    if (school.login === 'sso-launch' && (input.username !== undefined || input.password !== undefined)) throw new Error('School requires SSO');
    this.connecting.add(school.id);
    try {
      return school.login === 'sso-launch'
        ? await this.sso.login(school,token => this.acceptToken(school,token))
        : await this.acceptToken(school,await passwordToken(school.host,input.username ?? '',input.password ?? '',this.request));
    } finally { this.connecting.delete(school.id); }
  }
  private async acceptToken(school: MoodleSchool, token: string): Promise<MoodleAccount> {
    const info = await new MoodleClient(school.host,token,this.request).siteInfo();
    if (this.stopped) throw new Error('Moodle service closed');
    const existing = this.repository.accounts().find(account => account.schoolId === school.id && account.remoteUserId === info.userid);
    const account: MoodleAccount = {id:existing?.id ?? randomUUID(),schoolId:school.id,remoteUserId:info.userid,displayName:plainText(info.fullname),status:'connected',syncedAt:existing?.syncedAt ?? null};
    await this.secrets.set(moodleSecretId(account.id),token);
    if (this.stopped || existing && !this.repository.accounts().some(row => row.id === existing.id)) {
      this.secrets.delete(moodleSecretId(account.id));
      throw new Error('Moodle login cancelled');
    }
    this.repository.saveAccount(account);
    void this.sync(account.id);
    return account;
  }
  async disconnect(id: string) {
    this.repository.account(id);
    this.repository.disconnect(id);
    this.secrets.delete(moodleSecretId(id));
    await this.pending.get(id);
  }
  overview(accountId?: string) {
    const snapshot = this.repository.overview(accountId);
    for (const account of snapshot.accounts) if (account.status === 'connected' && (!account.syncedAt || Date.now() - Date.parse(account.syncedAt) > 5 * 60_000)) void this.sync(account.id);
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
    try { await new MoodleClient(schoolById(account.schoolId).host,await this.token(account.id),this.request).markRead(remote.remoteId); }
    catch (error) { if (error instanceof MoodleError && error.kind === 'auth' && this.repository.accounts().some(row => row.id === account.id)) this.repository.expired(account.id); }
  }
  sync(id: string): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const current = this.pending.get(id);
    if (current) return current;
    const work = this.refresh(id).catch(error => {
      if (error instanceof MoodleError && error.kind === 'auth' && this.repository.accounts().some(account => account.id === id)) this.repository.expired(id);
    }).finally(() => this.pending.delete(id));
    this.pending.set(id,work);
    return work;
  }
  private async refresh(id: string) {
    const account = this.repository.account(id);
    const client = new MoodleClient(schoolById(account.schoolId).host,await this.token(id),this.request);
    const info = await client.siteInfo();
    if (info.userid !== account.remoteUserId) throw new MoodleError('auth');
    const courses = await client.courses(account);
    const optional = async <T>(request: () => Promise<T>, cached: T): Promise<T> => {
      try { return await request(); } catch (error) { if (error instanceof MoodleError && error.kind === 'unsupported') return cached; throw error; }
    };
    const cached = courses.flatMap(course => { try { return [this.repository.course(course.id)]; } catch { return []; } });
    const assignments = await optional(() => client.assignments(id,courses),cached.flatMap(item => item.deadlines.filter(item => item.kind === 'assignment')));
    const events = await optional(() => client.events(id,courses),cached.flatMap(item => item.deadlines.filter(item => item.kind !== 'assignment')));
    const notifications = await optional(() => client.notifications(account,courses),this.repository.notificationRecords(id).map(row => ({...row,value:{...row.value,courseId:courses.some(course => course.id === row.value.courseId) ? row.value.courseId : null}})));
    const grades = [];
    const files = [];
    for (const course of courses) {
      grades.push(...await client.grades(course,account.remoteUserId).catch(error => { if (error instanceof MoodleError && error.kind === 'unsupported') return this.repository.gradeRecords(course.id); throw error; }));
      files.push(...await client.files(course).catch(error => { if (error instanceof MoodleError && error.kind === 'unsupported') return this.repository.fileRecords(course.id); throw error; }));
    }
    const matches = (assignment: typeof assignments[number], event: typeof events[number]) => assignment.courseId === event.courseId && (assignment.url === event.url && event.url !== null || assignment.title === event.title && assignment.dueAt === event.dueAt);
    const deadlines = [...assignments.map(assignment => ({...assignment,submitted:events.find(event => matches(assignment,event))?.submitted ?? assignment.submitted})),...events.filter(event => !assignments.some(assignment => matches(assignment,event)))];
    if (!this.stopped && this.repository.accounts().some(account => account.id === id)) this.repository.apply(id,{courses,deadlines,notifications,grades,files});
  }
  async dispose() { this.stopped = true; await Promise.allSettled(this.pending.values()); }
}
