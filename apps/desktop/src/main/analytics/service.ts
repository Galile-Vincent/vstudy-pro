import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { analyticsState, onboarding, rendererEvents, type Onboarding } from '../../shared/analytics';
import { recordEgress } from '../services/egress';
import { sanitizeEvent, sanitizeQueuedEvent, type AnalyticsEvent } from './schema';
import type { analyticsConfig } from './config';

export class AnalyticsService {
  private enabled = false;
  private installationId = '';
  private sessionId = '';
  private pending: Promise<void> | undefined;
  private controller?: AbortController;
  private retryAt = 0;
  private failures = 0;
  private epoch = 0;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private db: DatabaseSync, private config: ReturnType<typeof analyticsConfig>, private device: Record<string,unknown>, private request: typeof fetch = fetch, private now = Date.now) {
    this.safe(() => {
      const storedId=z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).safeParse(this.read<string>('installation_id',''));
      this.installationId = storedId.success ? storedId.data : randomUUID();
      this.write('installation_id',this.installationId);
      if (!this.read('school_profile',null)) this.write('school_profile',{school_id:null,school_name:null,school_source:'unknown',moodle_connected:false});
      this.enabled = this.read<boolean>('analytics_enabled',false) === true;
      if (!this.enabled || !config?.enabled) this.db.exec('DELETE FROM analytics_queue');
      this.sessionId = randomUUID();
      this.write('session_id',this.sessionId);
    });
  }
  private safe<T>(run:()=>T): T | undefined { try { return run(); } catch { return undefined; } }
  private read<T>(key:string,fallback:T):T {
    const row = this.db.prepare('SELECT value FROM analytics_state WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) as T : fallback;
  }
  private write(key:string,value:unknown) { this.db.prepare('INSERT INTO analytics_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)); }
  onConsentChanged?:()=>void;
  get consentRevision() {return this.epoch;}
  getInstallationId() { return { installation_id: this.installationId || null }; }
  get permitted() { return this.enabled && !!this.config?.enabled && !!this.installationId; }
  getState() {
    return this.safe(() => analyticsState.parse({enabled:this.enabled,onboarding_completed:this.read('onboarding_completed',false),onboarding:this.read('onboarding',null),installation_id_present:!!this.installationId,acquisition_source:this.read('acquisition_source',null),deletion_pending:this.read('deletion_pending',false)})) ?? {enabled:false,onboarding_completed:false,onboarding:null,installation_id_present:false,acquisition_source:null,deletion_pending:false};
  }
  setConsent(enabled:boolean) {
    if (this.enabled === enabled) return this.getState();
    this.safe(() => {
      this.enabled = false;
      this.epoch++;
      this.controller?.abort();
      this.db.exec('DELETE FROM analytics_queue');
      this.write('profile_hash','');
      this.write('analytics_enabled',enabled);
      this.enabled = enabled;
      this.onConsentChanged?.();
      if (enabled) {this.sessionId=randomUUID();this.write('session_id',this.sessionId);this.track('app_session_started');}
      this.retryAt = 0;
      if (enabled) this.profile();
    });
    return this.getState();
  }
  completeOnboarding(input:Onboarding) {
    this.safe(() => {
      const value = onboarding.parse(input);
      this.write('onboarding',value);
      this.write('onboarding_completed',true);
      this.write('acquisition_source',value.acquisition_source);
      this.track('onboarding_completed',value);
      this.profile();
    });
    return this.getState();
  }
  requestDeletion() {
    this.setConsent(false);
    this.safe(() => this.write('deletion_pending',true));
    return {pending:true as const,installation_id:this.installationId,method:'contact' as const,contact_url:'https://github.com/ava-apple/vstudy-pro',instructions:'Copy this installation ID and contact the app publisher through the support contact in the app distribution. Request deletion of the PostHog person and all associated events. Do not post the ID publicly.'};
  }
  rendererTrack(event:string,properties:unknown,eventId?:string) {
    if ((rendererEvents as readonly string[]).includes(event)) this.track(event as AnalyticsEvent,properties,eventId);
  }
  track(event:AnalyticsEvent,properties:unknown = {},eventId: string = randomUUID()) {
    return this.safe(() => {
      if (!this.permitted || !z.string().uuid().safeParse(eventId).success) return false;
      const clean = sanitizeEvent(event,properties);
      if (!clean) return false;
      const envelope = {event,uuid:eventId,distinct_id:this.installationId,timestamp:new Date(this.now()).toISOString(),properties:{...(event === '$identify' ? {$set:clean} : clean),event_id:eventId,session_id:this.sessionId,app_version:this.device.app_version,platform:this.device.platform,school_id:this.read('school_id',null),$geoip_disable:true,$process_person_profile:true}};
      const payload = JSON.stringify(envelope);
      if (payload.length > 8192) return false;
      this.db.exec('SAVEPOINT analytics_enqueue');
      try {
        const seen = this.db.prepare('INSERT OR IGNORE INTO analytics_seen VALUES (?)').run(eventId);
        if (seen.changes) this.db.prepare('INSERT INTO analytics_queue(event_id,payload) VALUES (?,?)').run(eventId,payload);
        this.db.exec('RELEASE analytics_enqueue');
      } catch (error) { this.db.exec('ROLLBACK TO analytics_enqueue; RELEASE analytics_enqueue'); throw error; }
      return true;
    }) ?? false;
  }
  profile() {
    this.safe(() => {
      if (!this.permitted) return;
      const clean = sanitizeEvent('$identify',{...this.device,acquisition_source:this.read('acquisition_source',undefined),...this.read('school_profile',{})});
      if (!clean) return;
      const hash = createHash('sha256').update(JSON.stringify(clean)).digest('hex');
      const pending=this.db.prepare("SELECT payload FROM analytics_queue WHERE json_extract(payload,'$.event')='$identify' ORDER BY sequence DESC LIMIT 1").get();
      const pendingHash=pending ? createHash('sha256').update(JSON.stringify(JSON.parse(String(pending.payload)).properties.$set)).digest('hex') : '';
      if (hash !== this.read('profile_hash','') && hash !== pendingHash) this.track('$identify',clean);
    });
  }
  school(school:{id:string;name:string}|null,connected=true) {
    this.safe(() => {
      const profile = {school_id:school?.id ?? null,school_name:school?.name ?? null,school_source:school ? 'moodle' : 'unknown',moodle_connected:connected};
      if (!sanitizeEvent('$identify',profile)) return;
      if (JSON.stringify(profile) === JSON.stringify(this.read('school_profile',null))) return;
      this.write('school_id',profile.school_id);
      this.write('school_profile',profile);
      this.profile();
    });
  }
  disconnected(connected=false) {
    this.safe(() => {this.write('school_profile',{...this.read('school_profile',{}),moodle_connected:connected});this.profile();});
    this.track('moodle_disconnected');
  }
  start() {
    this.safe(() => {
      const previous = this.read<string>('app_version','');
      if (!previous) this.track('app_first_opened',{app_version:this.device.app_version});
      else if (previous !== this.device.app_version) this.track('app_updated',{from_version:previous,to_version:this.device.app_version});
      this.write('app_version',this.device.app_version);
      this.track('app_opened',this.device);
      this.track('app_session_started');
      this.profile();
      this.timer = setInterval(() => {void this.flush();},15_000);
      this.timer.unref();
    });
  }
  flush(force=false):Promise<void> {
    if (this.pending) return this.pending;
    if (!this.permitted || !this.config || !force && this.now() < this.retryAt) return Promise.resolve();
    const epoch = this.epoch;
    this.pending = (async () => {
      try {
        const rows = this.db.prepare('SELECT event_id,payload FROM analytics_queue ORDER BY sequence LIMIT 50').all();
        if (!rows.length || !this.permitted) return;
        const batch = rows.flatMap(row => {
          const event=this.safe(()=>sanitizeQueuedEvent(JSON.parse(String(row.payload))));
          if (!event) {this.db.prepare('DELETE FROM analytics_queue WHERE event_id=?').run(String(row.event_id));return [];}
          return [event];
        });
        if (!batch.length) return;
        this.controller = new AbortController();
        const timeout = setTimeout(() => this.controller?.abort(),force ? 2500 : 10_000);
        try {
          recordEgress('analytics_capture',this.config!.host);
          const response = await this.request(this.config!.host+'/batch/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:this.config!.key,batch}),signal:this.controller.signal,redirect:'error'});
          await response.body?.cancel();
          if (!response.ok) throw new Error('capture_failed');
          if (epoch !== this.epoch) return;
          for (const event of batch) if (event.event === '$identify') this.write('profile_hash',createHash('sha256').update(JSON.stringify((event.properties as Record<string,unknown>).$set)).digest('hex'));
          for (const row of rows) this.db.prepare('DELETE FROM analytics_queue WHERE event_id=?').run(String(row.event_id));
          this.failures = 0;
          this.retryAt = 0;
        } finally {clearTimeout(timeout);}
      } catch {
        if (epoch === this.epoch) this.retryAt = this.now()+Math.min(300_000,5000*2**Math.min(6,this.failures++));
      }
    })().finally(() => {this.pending=undefined;});
    return this.pending;
  }
  async stop() {
    clearInterval(this.timer);
    const timeout=setTimeout(()=>this.controller?.abort(),2500);
    try {await this.flush(true);} finally {clearTimeout(timeout);}
  }
}

let current: AnalyticsService | undefined;
export function setAnalytics(service:AnalyticsService | undefined) {current=service;}
export function analytics() { return current; }
