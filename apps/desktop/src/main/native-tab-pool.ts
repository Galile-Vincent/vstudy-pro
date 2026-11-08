export const MAX_NATIVE_VIEWS = 4;
export const NATIVE_IDLE_MS = 10 * 60_000;
export const NATIVE_METRICS_INTERVAL_MS = 30_000;
export const NATIVE_MEMORY_HIGH = 1024 ** 3;
export const NATIVE_MEMORY_RECOVERY = 768 * 1024 ** 2;
export interface NativeResource {
  key: string;
  ownerId: number;
  kind: 'moodle' | 'web-chat';
  lastActiveAt: number;
  active(): boolean;
  protected(): boolean;
  processId(): number;
  discard(): void;
}
export interface NativeMetric { pid: number; memory: { workingSetSize: number } }
export class NativeTabPool {
  private readonly resources = new Map<string, NativeResource>();
  constructor(private readonly now: () => number = Date.now) {}
  get size() { return this.resources.size; }
  release(key: string) { this.resources.delete(key); }
  touch(key: string) { const resource = this.resources.get(key); if (resource) resource.lastActiveAt = this.now(); }
  private eligible(ownerId?: number) {
    return [...this.resources.values()].filter(item => (ownerId === undefined || item.ownerId === ownerId) && !item.active() && !item.protected()).sort((a,b) => a.lastActiveAt - b.lastActiveAt);
  }
  private discard(resource: NativeResource) { this.resources.delete(resource.key); resource.discard(); }
  acquire(resource: NativeResource): 'ready' | 'resource-limit' {
    if (this.resources.has(resource.key)) return 'ready';
    if(this.makeRoom(resource.ownerId)==='resource-limit') return 'resource-limit';
    this.resources.set(resource.key, resource);
    return 'ready';
  }
  makeRoom(ownerId:number): 'ready'|'resource-limit' {
    if ([...this.resources.values()].filter(item=>item.ownerId===ownerId).length<MAX_NATIVE_VIEWS) return 'ready';
    const victim=this.eligible(ownerId)[0];
    if(!victim) return 'resource-limit';
    this.discard(victim);return 'ready';
  }
  evaluate(metrics: readonly NativeMetric[]) {
    for (const resource of this.eligible()) if (this.now() - resource.lastActiveAt >= NATIVE_IDLE_MS) this.discard(resource);
    const pids = new Set([...this.resources.values()].map(item => item.processId()));
    const memory = new Map(metrics.filter(item => pids.has(item.pid)).map(item => [item.pid,item.memory.workingSetSize * 1024]));
    let total = [...memory.values()].reduce((sum,value) => sum + value,0);
    if (total <= NATIVE_MEMORY_HIGH) return;
    const candidates = this.eligible().sort((a,b) => Number(b.kind === 'web-chat') - Number(a.kind === 'web-chat') || a.lastActiveAt - b.lastActiveAt);
    for (const resource of candidates) {
      const pid = resource.processId();
      this.discard(resource);
      if (![...this.resources.values()].some(item => item.processId() === pid)) total -= memory.get(pid) ?? 0;
      if (total <= NATIVE_MEMORY_RECOVERY) break;
    }
  }
}
export const nativeTabPool = new NativeTabPool();
