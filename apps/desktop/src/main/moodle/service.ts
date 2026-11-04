import { moodleImage } from './files';
import { MoodleAuthError, tokensSchema, type MoodleTokens } from './auth';
import { normalizeSiteUrl, moodleFetch } from './site-url';
import { randomUUID } from 'node:crypto';
import type { MoodleAccount } from '../../shared/moodle';
import type { SecretStore } from '../services/secrets';
import { moodleSecretId } from '../services/secrets';
import { MoodleClient, MoodleError, passwordToken, plainText, type Fetch } from './client';
import { MoodleRepository } from './repository';
import { checkSite, type CheckedSite } from './discovery';

export class MoodleService {
  private readonly pending = new Map<string,Promise<{errors:string[]}>>();
  private stopped = false;
  private readonly signInStorage = new Map<string, 'session' | 'unsaved'>();
  private readonly lastAttempt = new Map<string,number>();
  constructor(readonly repository: MoodleRepository, private readonly secrets: SecretStore, private readonly sso: {login(site: CheckedSite, provider: number | undefined, accept: (tokens: MoodleTokens) => Promise<MoodleAccount>):Promise<MoodleAccount>}, private readonly request: Fetch = moodleFetch) {}
  private readonly connecting = new Set<string>();
  private readonly browserSites = new Set<string>();
  private async checkedSite(url: string) {
    const site = await checkSite(url,this.request);
    if (site.authPlan.kind === 'password' && this.browserSites.has(site.siteUrl)) return {...site,authPlan:{kind:'browser' as const,providers:site.config.identityproviders}};
    return site;
  }
  async checkSite(url: string) {
    const {siteUrl,siteName,authPlan,config} = await this.checkedSite(url);
    const icon = config.compactlogourl || config.logourl;
    const iconUrl = icon ? await moodleImage(icon,siteUrl,undefined,this.request) : null;
    return {siteUrl,siteName,authPlan,...(iconUrl ? {iconUrl} : {})};
  }
  async connect(input: {siteUrl:string;storage?:'secure'|'session' | undefined;provider?:number | undefined;username?:string | undefined;password?:string | undefined}): Promise<MoodleAccount> {
    if (input.storage !== 'session') await this.secrets.preflight();
    const checked = await this.checkedSite(input.siteUrl);
    if (checked.authPlan.kind === 'unavailable') throw new Error(checked.authPlan.reason);
    if (this.stopped || this.connecting.has(checked.siteUrl)) throw new Error('Moodle login unavailable');
    const browser = checked.authPlan.kind !== 'password';
    if (browser && (input.username !== undefined || input.password !== undefined)) throw new MoodleAuthError('sso-required');
    this.connecting.add(checked.siteUrl);
    try {
      return browser
        ? await this.sso.login(checked,input.provider,tokens => this.acceptToken(checked,tokens,input.storage))
        : await this.acceptToken(checked,await passwordToken(checked.siteUrl,input.username ?? '',input.password ?? '',this.request),input.storage);
    } catch (error) {
      if (error instanceof MoodleAuthError && error.code === 'sso-required') this.browserSites.add(checked.siteUrl);
      throw error;
    } finally { this.connecting.delete(checked.siteUrl); }
  }
  private async acceptToken(site: CheckedSite, tokens: MoodleTokens, storage: 'secure' | 'session' = 'secure'): Promise<MoodleAccount> {
    const info = await new MoodleClient(site.siteUrl,tokens.token,this.request).siteInfo();
    if (!info.siteurl || normalizeSiteUrl(info.siteurl) !== site.siteUrl) throw new MoodleAuthError('requirecorrectaccess');
    if (info.version && Number(info.version) < 2018051700) throw new Error('unsupported-version');
    if (this.stopped) throw new Error('Moodle service closed');
    const existing = this.repository.accounts().find(account => account.siteUrl === site.siteUrl && account.remoteUserId === info.userid);
    const expired = this.repository.accounts().filter(account => account.siteUrl === site.siteUrl && account.status === 'expired');
    if (!existing && expired.length) throw new MoodleAuthError('requirecorrectaccess');
    if (existing) await this.pending.get(existing.id);
    const account: MoodleAccount = {id:existing?.id ?? randomUUID(),siteUrl:site.siteUrl,siteName:site.siteName,remoteUserId:info.userid,displayName:plainText(info.fullname),status:'connected',syncedAt:existing?.syncedAt ?? null};
    const verifiedTokens = {...tokens,...(info.userprivateaccesskey ? {userPrivateAccessKey:info.userprivateaccesskey} : {})};
    if (storage === 'session') this.secrets.delete(moodleSecretId(account.id));
    this.secrets.useInSession(moodleSecretId(account.id),JSON.stringify(verifiedTokens));
    this.signInStorage.set(account.id,storage === 'session' ? 'session' : 'unsaved');
    if (this.stopped || existing && !this.repository.accounts().some(row => row.id === existing.id)) {
      this.secrets.delete(moodleSecretId(account.id));
      throw new MoodleAuthError('cancelled');
    }
    this.repository.saveAccount(account);
    await this.saveCapabilities(account,info);
    if (storage === 'secure') {
      try { await this.retrySave(account.id); } catch { /* The verified session remains connected. */ }
    }
    if (this.stopped || !this.repository.accounts().some(row => row.id === account.id)) throw new MoodleAuthError('cancelled');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([this.sync(account.id),new Promise<void>(resolve => { timer = setTimeout(resolve,30_000); })]); }
    finally { clearTimeout(timer); }
    return {...this.repository.account(account.id),...(this.signInStorage.has(account.id) ? {signInStorage:this.signInStorage.get(account.id)!} : {})};
  }
  async retrySave(id: string) {
    this.repository.account(id);
    const value = await this.secrets.getInMainOnly(moodleSecretId(id));
    if (!value) throw new MoodleError('auth');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.secrets.set(moodleSecretId(id),value);
        if (this.stopped || !this.repository.accounts().some(row => row.id === id)) {
          this.secrets.delete(moodleSecretId(id));
          throw new MoodleAuthError('cancelled');
        }
        this.signInStorage.delete(id);
        return;
      } catch (error) {
        if (this.stopped || !this.repository.accounts().some(row => row.id === id)) throw error;
        this.secrets.useInSession(moodleSecretId(id),value);
        if (attempt === 1) throw error;
      }
    }
  }
  async disconnect(id: string) {
    this.repository.account(id);
    this.repository.disconnect(id);
    this.signInStorage.delete(id);
    this.secrets.delete(moodleSecretId(id));
    await this.pending.get(id);
  }
  overview(accountId?: string) {
    const snapshot = this.repository.overview(accountId);
    for (const account of snapshot.accounts) if (account.status === 'connected' && Date.now() - (this.lastAttempt.get(account.id) ?? 0) >= 60_000 && (!account.syncedAt || Date.now() - Date.parse(account.syncedAt) > 5 * 60_000)) void this.sync(account.id);
    snapshot.accounts = snapshot.accounts.map(account => ({...account,...(this.signInStorage.has(account.id) ? {signInStorage:this.signInStorage.get(account.id)!} : {})}));
    return snapshot;
  }
  private async tokens(id: string): Promise<MoodleTokens> {
    const stored = await this.secrets.getInMainOnly(moodleSecretId(id));
    if (!stored) throw new MoodleError('auth');
    try { return stored.startsWith('{') ? tokensSchema.parse(JSON.parse(stored)) : {token:stored}; }
    catch { throw new MoodleError('auth'); }
  }
  async token(id: string): Promise<string> { return (await this.tokens(id)).token; }
  private async saveCapabilities(account: MoodleAccount, info: Awaited<ReturnType<MoodleClient['siteInfo']>>) {
    if (info.userprivateaccesskey) {
      const tokens = await this.tokens(account.id);
      if (tokens.userPrivateAccessKey !== info.userprivateaccesskey) {
        this.secrets.useInSession(moodleSecretId(account.id),JSON.stringify({...tokens,userPrivateAccessKey:info.userprivateaccesskey}));
        if (this.signInStorage.get(account.id) !== 'session') {
          this.signInStorage.set(account.id,'unsaved');
          try { await this.retrySave(account.id); } catch { /* Retain the updated key in this session. */ }
        }
      }
    }
    const previous = this.repository.capabilities(account.id);
    this.repository.saveCapabilities(account.id,{functions:info.functions?.map(item => item.name),release:info.release,version:info.version,advancedfeatures:info.advancedfeatures,mobileConfig:previous?.mobileConfig ?? {}});
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
    if (account.status === 'expired') throw new MoodleError('auth');
    const client = new MoodleClient(account.siteUrl,await this.token(id),this.request);
    const info = await client.siteInfo();
    if (info.userid !== account.remoteUserId || info.siteurl && normalizeSiteUrl(info.siteurl) !== account.siteUrl) throw new MoodleError('auth');
    await this.saveCapabilities(account,info);
    client.setFunctions(info.functions?.map(item => item.name));
    if (client.wsAvailable('tool_mobile_get_config') && info.functions) {
      try {
        const config = await client.mobileConfig();
        this.repository.saveCapabilities(id,{...this.repository.capabilities(id)!,mobileConfig:Object.fromEntries(config.settings.filter(item => !/token|private|secret|password|sesskey/i.test(item.name)).map(item => [item.name,item.value]))});
      } catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; }
    }
    for (const row of this.repository.notificationRecords(id).filter(row => row.value.pendingRemoteRead)) {
      try { await client.markRead(row.remoteId); this.repository.acknowledgeRead(row.value.id); } catch { /* Retry on the next sync. */ }
    }
    const courses = await client.courses(account);
    const errors: string[] = [];
    const optional = async <T>(request: () => Promise<T>, cached: T): Promise<T> => {
      try { return await request(); } catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; if (!(error instanceof MoodleError) || error.kind !== 'unsupported') errors.push(error instanceof MoodleError ? error.kind : 'service'); return cached; }
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
