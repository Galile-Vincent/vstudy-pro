/**
 * Cache account-scoped Moodle read responses with TTLs and shared in-flight loads.
 * Owned by main/cache.
 * Cache entries are account-scoped; stale data never implies a successful refresh.
 * @packageDocumentation
 */
import type { DatabaseSync } from 'node:sqlite';
import type { z } from 'zod';

export const resourceTtl = {
  courses: 5 * 60_000, contents: 5 * 60_000, deadlines: 60_000,
  notifications: 60_000, grades: 5 * 60_000, teachers: 60 * 60_000,
  announcements: 5 * 60_000, configuration: 60 * 60_000,
} as const;
export type ResourceKind = keyof typeof resourceTtl;
export interface Validators { etag?: string; modifiedAt?: string }
/** A validator hit reuses stored bytes; modified responses must supply a new validated payload. */
export type CacheResponse<T> = { status: 'modified'; value: T; validators?: Validators } | { status: 'unmodified' };
/** Freshness describes this read; lastSyncedAt remains the time of the last successful remote response. */
export interface Cached<T> { value: T; lastSyncedAt: string; state: 'fresh' | 'stale' | 'offline' }
/** Account, kind, key, and revision identify one validated value; mode selects stale refresh or offline behavior. */
export interface CacheRequest<T> {
  accountId: string; kind: ResourceKind; key: string; schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  revision?: string; mode?: 'swr' | 'refresh' | 'offline';
  canUseOffline?: (error: unknown) => boolean;
}
type Stored = { data: string; syncedAt: number; etag: string | null; modifiedAt: string | null };

/** A small read-through interface with an injectable clock and deterministic eviction. */
export class MoodleResponseCache {
  private readonly pending = new Map<string, { promise: Promise<Stored>; controller: AbortController }>();
  private readonly generations = new Map<string, number>();
  private generation = 0;
  private access = 0;
  constructor(private readonly db: DatabaseSync, private readonly clock = Date.now,
    private readonly limits = { bytes: 32 * 1024 * 1024, entries: 2000, entryBytes: 2 * 1024 * 1024 }) {
    this.access = Number(db.prepare('SELECT coalesce(max(accessedAt),0) n FROM moodle_response_cache').get()?.n);
    this.evict();
  }
  private evict(): void {
    const total = this.db.prepare('SELECT coalesce(sum(bytes),0) bytes,count(*) entries FROM moodle_response_cache').get()!;
    let bytes = Number(total.bytes), entries = Number(total.entries);
    if (bytes <= this.limits.bytes && entries <= this.limits.entries) return;
    for (const row of this.db.prepare('SELECT accountId,kind,key,bytes FROM moodle_response_cache ORDER BY accessedAt').all()) {
      this.db.prepare('DELETE FROM moodle_response_cache WHERE accountId=? AND kind=? AND key=?').run(row.accountId!, row.kind!, row.key!);
      bytes -= Number(row.bytes); entries--;
      if (bytes <= this.limits.bytes && entries <= this.limits.entries) break;
    }
  }
  private read<T>(request: CacheRequest<T>): Stored | undefined {
    const row = this.db.prepare('SELECT data,syncedAt,etag,modifiedAt,revision FROM moodle_response_cache WHERE accountId=? AND kind=? AND key=?').get(request.accountId,request.kind,request.key);
    if (!row) return;
    if ((row.revision ?? undefined) !== request.revision) { this.remove(request); return; }
    try { request.schema.parse(JSON.parse(String(row.data))); }
    catch { this.remove(request); return; }
    this.db.prepare('UPDATE moodle_response_cache SET accessedAt=? WHERE accountId=? AND kind=? AND key=?').run(++this.access,request.accountId,request.kind,request.key);
    return {data:String(row.data),syncedAt:Number(row.syncedAt),etag:row.etag as string | null,modifiedAt:row.modifiedAt as string | null};
  }
  private remove<T>(r: CacheRequest<T>): void {
    this.db.prepare('DELETE FROM moodle_response_cache WHERE accountId=? AND kind=? AND key=?').run(r.accountId,r.kind,r.key);
  }
  private refresh<T>(r: CacheRequest<T>, previous: Stored | undefined,
    load: (validators: Validators, signal: AbortSignal) => Promise<CacheResponse<T>>): Promise<Stored> {
    const id = JSON.stringify([r.accountId,r.kind,r.key,r.revision]);
    const existing = this.pending.get(id);
    if (existing) return existing.promise;
    const generation = this.generation, accountGeneration = this.generations.get(r.accountId) ?? 0;
    const controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      const result = await load({...previous?.etag ? {etag:previous.etag} : {},...previous?.modifiedAt ? {modifiedAt:previous.modifiedAt} : {}},controller.signal);
      controller.signal.throwIfAborted();
      if (generation !== this.generation || accountGeneration !== (this.generations.get(r.accountId) ?? 0)) throw new Error('Cache purged');
      if (result.status === 'unmodified' && !previous) throw new Error('Unmodified response without cached data');
      const data = result.status === 'modified' ? JSON.stringify(result.value) : previous!.data;
      r.schema.parse(JSON.parse(data));
      const syncedAt = this.clock();
      const validators = result.status === 'modified' ? result.validators : previous;
      const stored = {data,syncedAt,etag:validators?.etag ?? null,modifiedAt:validators?.modifiedAt ?? null};
      const bytes = Buffer.byteLength(data);
      if (bytes <= this.limits.entryBytes && bytes <= this.limits.bytes) {
        this.db.prepare(`INSERT INTO moodle_response_cache(accountId,kind,key,data,bytes,syncedAt,accessedAt,etag,modifiedAt,revision)
          VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(accountId,kind,key) DO UPDATE SET data=excluded.data,bytes=excluded.bytes,syncedAt=excluded.syncedAt,
          accessedAt=excluded.accessedAt,etag=excluded.etag,modifiedAt=excluded.modifiedAt,revision=excluded.revision`)
          .run(r.accountId,r.kind,r.key,data,bytes,syncedAt,++this.access,stored.etag,stored.modifiedAt,r.revision ?? null);
        this.evict();
      } else this.remove(r);
      return stored;
    }).finally(() => { if (this.pending.get(id)?.promise === promise) this.pending.delete(id); });
    this.pending.set(id,{promise,controller});
    return promise;
  }
  /** Fresh reads avoid IO. Stale reads return immediately and share one background refresh. */
  async get<T>(r: CacheRequest<T>, load: (validators: Validators, signal: AbortSignal) => Promise<CacheResponse<T>>): Promise<Cached<T>> {
    const stored = this.read(r);
    const view = (row: Stored, state: Cached<T>['state']): Cached<T> => ({value:r.schema.parse(JSON.parse(row.data)),lastSyncedAt:new Date(row.syncedAt).toISOString(),state});
    if (r.mode === 'offline') { if (!stored) throw new Error('No cached response'); return view(stored,'offline'); }
    if (stored && r.mode !== 'refresh') {
      if (this.clock() - stored.syncedAt < resourceTtl[r.kind]) return view(stored,'fresh');
      void this.refresh(r,stored,load).catch(() => {});
      return view(stored,'stale');
    }
    try { return view(await this.refresh(r,stored,load),'fresh'); }
    catch (error) { if (stored && !this.pending.has(JSON.stringify([r.accountId,r.kind,r.key,r.revision])) && !String(error).includes('Cache purged') && r.canUseOffline?.(error)) return view(stored,'offline'); throw error; }
  }
  /** Remove data and cancel in-flight writes before sign-out or explicit cache cleanup. */
  clear(accountId?: string): void {
    if (accountId) this.generations.set(accountId,(this.generations.get(accountId) ?? 0) + 1); else this.generation++;
    for (const [id,pending] of this.pending) if (!accountId || JSON.parse(id)[0] === accountId) { pending.controller.abort(new Error('Cache purged')); this.pending.delete(id); }
    if (accountId) this.db.prepare('DELETE FROM moodle_response_cache WHERE accountId=?').run(accountId);
    else this.db.exec('DELETE FROM moodle_response_cache');
  }
  async waitForIdle(): Promise<void> { await Promise.allSettled([...this.pending.values()].map(p => p.promise)); }
}
const caches = new WeakMap<DatabaseSync,MoodleResponseCache>();
/** Share purge fencing across repositories that use the same database connection. */
export function responseCache(db: DatabaseSync): MoodleResponseCache {
  let cache = caches.get(db);
  if (!cache) { cache = new MoodleResponseCache(db); caches.set(db,cache); }
  return cache;
}
