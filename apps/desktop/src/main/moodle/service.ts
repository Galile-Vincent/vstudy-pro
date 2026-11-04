import { applyAuthoritativeTeachers } from './identity';
import { MoodleScheduler } from './scheduler';
import { log } from '../logging';
import type { MoodleCallTiming } from './client';
import type { MoodleProgress } from '../../shared/ipc';
import { completionState } from './contents';
import { moodleImage } from './files';
import { MoodleAuthError, tokensSchema, type MoodleTokens } from './auth';
import { normalizeSiteUrl, moodleFetch } from './site-url';
import { randomUUID } from 'node:crypto';
import type { MoodlePanel, MoodleAccount } from '../../shared/moodle';
import type { SecretStore } from '../services/secrets';
import { moodleSecretId } from '../services/secrets';
import { MoodleClient, MoodleError, passwordToken, plainText, type Fetch } from './client';
import { MoodleRepository } from './repository';
import { checkSite, type CheckedSite } from './discovery';

export class MoodleService {
  private readonly pending = new Map<string,Promise<{errors:string[]}>>();
  private stopped = false;
  private readonly detailPending = new Map<string,Promise<void>>();
  private readonly detailAttempts = new Map<string,number>();
  private readonly queue = new MoodleScheduler(6);
  private readonly contentReady = new Map<string,Promise<void>>();
  private readonly panels=new Map<string,Partial<Record<MoodlePanel,'loading'|'idle'|'error'>>>();
  private readonly panelFresh = new Set<string>();
  private readonly detailErrors = new Map<string,string>();
  private readonly teacherCache = new Map<string,number>();
  private readonly lastAttempt = new Map<string,number>();
  constructor(readonly repository: MoodleRepository, private readonly secrets: SecretStore, private readonly sso: {login(site: CheckedSite, provider: number | undefined, accept: (tokens: MoodleTokens) => Promise<MoodleAccount>):Promise<MoodleAccount>}, private readonly request: Fetch = moodleFetch, private readonly language: () => string = () => 'zh-tw', private readonly progress: (event:MoodleProgress)=>void = () => {}) {}
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
  async connect(input: {siteUrl:string;provider?:number | undefined;username?:string | undefined;password?:string | undefined}): Promise<MoodleAccount> {
    const checked = await this.checkedSite(input.siteUrl);
    if (checked.authPlan.kind === 'unavailable') throw new Error(checked.authPlan.reason);
    if (this.stopped || this.connecting.has(checked.siteUrl)) throw new Error('Moodle login unavailable');
    const browser = checked.authPlan.kind !== 'password';
    if (browser && (input.username !== undefined || input.password !== undefined)) throw new MoodleAuthError('sso-required');
    this.connecting.add(checked.siteUrl);
    try {
      return browser
        ? await this.sso.login(checked,input.provider,tokens => this.acceptToken(checked,tokens))
        : await this.acceptToken(checked,await passwordToken(checked.siteUrl,input.username ?? '',input.password ?? '',this.request));
    } catch (error) {
      if (error instanceof MoodleAuthError && error.code === 'sso-required') this.browserSites.add(checked.siteUrl);
      throw error;
    } finally { this.connecting.delete(checked.siteUrl); }
  }
  private async acceptToken(site: CheckedSite, tokens: MoodleTokens): Promise<MoodleAccount> {
    const client = new MoodleClient(site.siteUrl,tokens.token,this.request);
    client.setLanguage(this.language());
    const info = await client.siteInfo();
    if (!info.siteurl || normalizeSiteUrl(info.siteurl) !== site.siteUrl) throw new MoodleAuthError('requirecorrectaccess');
    if (info.version && Number(info.version) < 2018051700) throw new Error('unsupported-version');
    if (this.stopped) throw new Error('Moodle service closed');
    const existing = this.repository.accounts().find(account => account.siteUrl === site.siteUrl && account.remoteUserId === info.userid);
    const expired = this.repository.accounts().filter(account => account.siteUrl === site.siteUrl && account.status === 'expired');
    if (!existing && expired.length) throw new MoodleAuthError('requirecorrectaccess');
    if (existing) await this.pending.get(existing.id);
    const account: MoodleAccount = {id:existing?.id ?? randomUUID(),siteUrl:site.siteUrl,siteName:site.siteName,remoteUserId:info.userid,displayName:plainText(info.fullname),status:'connected',syncedAt:existing?.syncedAt ?? null};
    await this.secrets.set(moodleSecretId(account.id),JSON.stringify(tokens));
    if (this.stopped || existing && !this.repository.accounts().some(row => row.id === existing.id)) {
      this.secrets.delete(moodleSecretId(account.id));
      throw new MoodleAuthError('cancelled');
    }
    this.repository.saveAccount(account);
    await this.saveCapabilities(account,info,tokens);
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
  async course(id: string, force = false) {
    const cached = this.repository.course(id);
    const last = this.detailAttempts.get(id) ?? 0;
    if (!this.stopped && this.repository.account(cached.course.accountId).status === 'connected' && (force || Date.now() - last >= 60_000) && (force || !this.panelFresh.has(id) || !this.repository.detailCache(id) || Date.now() - Date.parse(this.repository.detailCache(id)!.refreshedAt) > 5 * 60_000)) {
      const work = this.refreshCourse(id);
      if (!this.repository.detailCache(id)) await this.contentReady.get(id);
      void work;
    } else if (!this.repository.detailCache(id)) await this.contentReady.get(id);
    return {...this.repository.course(id),panels:{...this.panels.get(id)},fetchState:this.detailPending.has(id) ? 'loading' as const : this.detailErrors.has(id) ? 'error' as const : 'idle' as const};
  }
  refreshCourse(id: string): Promise<void> {
    const pending = this.detailPending.get(id);
    if (pending) return pending;
    if (this.stopped) return Promise.resolve();
    this.panelFresh.add(id);
    this.detailAttempts.set(id,Date.now());
    this.detailErrors.delete(id);
    this.panels.set(id,{});
    let ready!:()=>void;
    this.contentReady.set(id,new Promise<void>(resolve => {ready=resolve;}));
    const work = this.loadCourse(id,ready).catch(error => {
      this.detailErrors.set(id,error instanceof MoodleError ? error.kind : 'service');
      const accountId = (() => { try { return this.repository.course(id).course.accountId; } catch { return null; } })();
      if (accountId && error instanceof MoodleError && error.kind === 'auth') this.repository.expired(accountId);
    }).finally(() => {ready();this.detailPending.delete(id);this.contentReady.delete(id);
      try {this.progress({accountId:this.repository.course(id).course.accountId,courseId:id,state:this.detailErrors.has(id) ? 'error' : 'idle',completed:1,total:1});} catch { /* Account disconnected. */ }
    });
    this.detailPending.set(id,work);
    return work;
  }
  private async loadCourse(id: string, ready:()=>void) {
    try {
      if (this.stopped) return;
      const detail = this.repository.course(id);
      const account = this.repository.account(detail.course.accountId);
      const client = new MoodleClient(account.siteUrl,await this.token(account.id),this.request,{queue:this.queue,priority:10});
      const functions = this.repository.capabilities(account.id)?.functions;
      client.setFunctions(functions);
      client.setLanguage(this.language());
      const active = () => !this.stopped && this.repository.accounts().some(row => row.id === account.id);
      const panelNames:Record<string,MoodlePanel>={core_course_get_contents:'contents',core_completion_get_activities_completion_status:'completion',mod_assign_get_assignments:'assignments',mod_quiz_get_quizzes_by_courses:'quizzes',core_enrol_get_enrolled_users:'teachers',mod_forum_get_forums_by_courses:'announcements',gradereport_user_get_grade_items:'grades'};
      const optional = async <T>(name: string, request: () => Promise<T>): Promise<T | undefined> => {
        if (!client.wsAvailable(name)) return undefined;
        const panel=panelNames[name]!;
        const states=this.panels.get(id)!;
        states[panel]='loading';
        this.progress({accountId:account.id,courseId:id,panel,state:'loading',completed:0,total:1});
        try { const result=await request();states[panel]='idle';return result; }
        catch (error) {
          states[panel]='error';
          if (!(error instanceof MoodleError) || error.kind !== 'unsupported') this.detailErrors.set(id,'service');
          if (error instanceof MoodleError && error.kind === 'auth') throw error;
          return undefined;
        } finally {this.progress({accountId:account.id,courseId:id,panel,state:states[panel]!,completed:1,total:1});}
      };
      this.progress({accountId:account.id,courseId:id,state:'loading',completed:0,total:1});
      const contents=await optional('core_course_get_contents',() => client.courseContents(detail.course));
      if (contents && active()) this.repository.saveDetail(id,{sections:contents.sections},contents.files);
      ready();
      this.progress({accountId:account.id,courseId:id,state:'loading',completed:1,total:1});
      await Promise.all([(async () => {
      if (contents && active()) {
        const [statuses,assignments,quizzes] = await Promise.all([
          detail.course.identity.enableCompletion ? optional('core_completion_get_activities_completion_status',() => client.completion(detail.course,account.remoteUserId)) : undefined,
          optional('mod_assign_get_assignments',() => client.assignments(account.id,[detail.course])),
          optional('mod_quiz_get_quizzes_by_courses',() => client.quizDeadlines(detail.course)),
        ]);
        const deadlines = [...new Map([...detail.deadlines,...(assignments ?? []),...(quizzes ?? [])].map(item => [item.id,item])).values()];
        if (active()) {
          const latest=this.repository.course(id);
          this.repository.apply(account.id,{courses:[latest.course],deadlines,notifications:[],grades:this.repository.gradeRecords(id),files:this.repository.fileRecords(id)},id);
        }
        for (const section of contents.sections) for (const module of section.modules) {
          const status = statuses?.find(status => status.cmid === module.cmid);
          if (status) module.completion = completionState(status.state,status.tracking);
          const deadline = deadlines.find(deadline => deadline.url && deadline.url === module.url);
          if (deadline) { module.dueAt = deadline.dueAt; module.submitted = deadline.submitted; }
        }
        if (statuses?.length && active()) {
          const tracked = statuses.filter(status => status.tracking !== 0);
          if (tracked.length) {
            const latest = this.repository.course(id).course;
            this.repository.saveCourse({...latest,progress:100 * tracked.filter(status => status.state > 0).length / tracked.length,identity:{...latest.identity,hasProgress:true}});
          }
        }
        if (active()) this.repository.saveDetail(id,{sections:contents.sections},contents.files);
      }
      })(),(async () => {
      if (detail.course.identity.teacherSource !== 'contacts' && Date.now() - (this.teacherCache.get(id) ?? 0) > 3600_000) {
        const teachers = await optional('core_enrol_get_enrolled_users',() => client.teachers(detail.course));
        if (teachers && active()) {
          this.teacherCache.set(id,Date.now());
          if (teachers.length) {
            const latest = this.repository.course(id).course;
            this.repository.saveCourse({...latest,identity:{...applyAuthoritativeTeachers(latest.identity,teachers),teacherSource:'enrolment'}});
          }
        }
      }
      })(),(async () => {
        const grades=await optional('gradereport_user_get_grade_items',() => client.grades(detail.course,account.remoteUserId));
        if (grades && active()) {
          const latest=this.repository.course(id);
          this.repository.apply(account.id,{courses:[latest.course],deadlines:latest.deadlines,notifications:[],grades,files:this.repository.fileRecords(id)},id);
        }
      })(),(async () => {
      const announcements = await optional('mod_forum_get_forums_by_courses',() => client.announcements(this.repository.course(id).course));
      if (announcements && active()) this.repository.saveDetail(id,{announcements});
      })()]);
    } finally {
      ready();
    }
  }
  private async tokens(id: string): Promise<MoodleTokens> {
    const stored = await this.secrets.getInMainOnly(moodleSecretId(id));
    if (!stored) throw new MoodleError('auth');
    try { return stored.startsWith('{') ? tokensSchema.parse(JSON.parse(stored)) : {token:stored}; }
    catch { throw new MoodleError('auth'); }
  }
  async token(id: string): Promise<string> { return (await this.tokens(id)).token; }
  private async saveCapabilities(account: MoodleAccount, info: Awaited<ReturnType<MoodleClient['siteInfo']>>, tokens: MoodleTokens) {
    if (info.userprivateaccesskey) await this.secrets.set(moodleSecretId(account.id),JSON.stringify({...tokens,userPrivateAccessKey:info.userprivateaccesskey}));
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
    const started=performance.now(), calls:MoodleCallTiming[]=[];
    this.progress({accountId:id,state:'loading',completed:0,total:0});
    try {
    const account = this.repository.account(id);
    if (account.status === 'expired') throw new MoodleError('auth');
    const client = new MoodleClient(account.siteUrl,await this.token(id),this.request,{queue:this.queue,priority:0,timing:call => calls.push(call)});
    client.setLanguage(this.language());
    const info = await client.siteInfo();
    if (info.userid !== account.remoteUserId || info.siteurl && normalizeSiteUrl(info.siteurl) !== account.siteUrl) throw new MoodleError('auth');
    await this.saveCapabilities(account,info,await this.tokens(id));
    client.setFunctions(info.functions?.map(item => item.name));
    client.setLanguage(this.language());
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
    this.repository.apply(id,{courses,deadlines:[],notifications:this.repository.notificationRecords(id).filter(row => !row.value.courseId || courses.some(course => course.id === row.value.courseId)),grades:[],files:[]},'@notifications');
    this.progress({accountId:id,state:'loading',completed:0,total:courses.length});
    const errors: string[] = [];
    const optional = async <T>(request: () => Promise<T>, cached: T): Promise<T> => {
      try { return await request(); } catch (error) { if (error instanceof MoodleError && error.kind === 'auth') throw error; if (!(error instanceof MoodleError) || error.kind !== 'unsupported') errors.push(error instanceof MoodleError ? error.kind : 'service'); return cached; }
    };
    const cached = courses.flatMap(course => { try { return [this.repository.course(course.id)]; } catch { return []; } });
    const events = await optional(() => client.events(id,courses),cached.flatMap(item => item.deadlines.filter(item => item.kind !== 'assignment')));
    const notifications = await optional(() => client.notifications(account,courses),this.repository.notificationRecords(id).map(row => ({...row,value:{...row.value,courseId:courses.some(course => course.id === row.value.courseId) ? row.value.courseId : null}})));
    const active = () => !this.stopped && this.repository.accounts().some(account => account.id === id);
    let completed=0;
    const current=courses.filter(course => course.identity.lifecycle === 'current');
    const outcomes=await Promise.allSettled(current.map(async course => {
      const [assignments,grades,contents] = await Promise.all([
        optional(() => client.assignments(id,[course],false),cached.find(item => item.course.id === course.id)?.deadlines.filter(item => item.kind === 'assignment') ?? []),
        Promise.resolve(this.repository.gradeRecords(course.id)),
        optional(() => client.courseContents(course),undefined),
      ]);
      if (active()) {
        const deadlines=[...assignments,...events.filter(event => event.courseId === course.id && !assignments.some(item => item.url === event.url))];
        this.repository.apply(id,{courses:[course],deadlines,notifications:[],grades,files:contents?.files ?? this.repository.fileRecords(course.id)},course.id);
        if (contents) this.repository.saveDetail(course.id,{sections:contents.sections},contents.files);
        this.progress({accountId:id,state:'loading',completed:++completed,total:current.length});
      }
    }));
    const rejected=outcomes.find(outcome => outcome.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
    if (active()) this.repository.apply(id,{courses,deadlines:[],notifications,grades:[],files:[]},'@notifications');
    this.progress({accountId:id,state:errors.length ? 'error' : 'idle',completed:current.length,total:current.length});
    return {errors};
    } catch (error) {this.progress({accountId:id,state:'error',completed:0,total:0});throw error;}
    finally {log({phase:'moodle-sync',ms:performance.now()-started,calls:calls.reduce((sum,call)=>sum+call.requests,0),bytes:calls.reduce((sum,call)=>sum+call.bytes,0),slowest:[...calls].sort((a,b)=>b.ms-a.ms).slice(0,5)});}
  }

  async dispose() { this.stopped = true; await Promise.allSettled([...this.pending.values(),...this.detailPending.values()]); }
}
