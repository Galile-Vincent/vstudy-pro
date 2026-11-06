import type { AnalyticsService } from './service';
export const IDLE_THRESHOLD_SECONDS = 5 * 60;
export const SUMMARY_INTERVAL_MS = 90_000;
export class AnalyticsActivity {
  private last: number;
  private totals = {active_ms:0,idle_ms:0,background_ms:0};
  private window = {active_ms:0,idle_ms:0,background_ms:0};
  private started: number;
  private windowStart: number;
  private focused = false;
  constructor(private service:AnalyticsService,private idleSeconds:()=>number,private now=()=>performance.now()) {this.last=now();this.started=this.last;this.windowStart=this.last;}
  sample() {
    const now = this.now(), delta = Math.max(0,Math.round(now-this.last));
    this.last = now;
    let idle=IDLE_THRESHOLD_SECONDS;
    try {idle=this.idleSeconds();} catch {idle=IDLE_THRESHOLD_SECONDS;}
    const key = !this.focused ? 'background_ms' : idle >= IDLE_THRESHOLD_SECONDS ? 'idle_ms' : 'active_ms';
    this.totals[key]+=delta;
    this.window[key]+=delta;
    if (now-this.windowStart>=SUMMARY_INTERVAL_MS) this.summary(now);
  }
  focus(focused:boolean) {this.sample();this.focused=focused;this.service.track(focused?'app_focused':'app_unfocused');}
  reset() {this.last=this.now();this.started=this.last;this.windowStart=this.last;this.totals={active_ms:0,idle_ms:0,background_ms:0};this.window={...this.totals};}
  private summary(now:number) {this.service.track('app_activity_summary',{...this.window,window_ms:Math.round(now-this.windowStart)});this.window={active_ms:0,idle_ms:0,background_ms:0};this.windowStart=now;}
  end() {this.sample();this.summary(this.last);this.service.track('app_session_ended',{...this.totals,elapsed_ms:Math.round(this.last-this.started)});this.service.track('app_close_requested',{close_reason:'quit'});}
}
