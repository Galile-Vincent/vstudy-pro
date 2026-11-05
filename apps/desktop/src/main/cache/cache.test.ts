/** Cache contracts use an in-memory SQLite store and an explicit clock. */
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { openStore, type Store } from '../db';
import { MoodleResponseCache, resourceTtl } from './index';
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function fixture(limits?: {bytes:number;entries:number;entryBytes:number}) {
  const store = openStore(':memory:'); stores.push(store);
  for (const id of ['a','b']) store.db.prepare('INSERT INTO moodle_accounts VALUES(?,?,?,?)').run(id,'https://school.example',id === 'a' ? 1 : 2,'{}');
  let now = 1000;
  const cache = new MoodleResponseCache(store.db,() => now,limits);
  const request = {accountId:'a',kind:'courses' as const,key:'list',schema:z.string(),canUseOffline:() => true};
  return {store,cache,request,advance:() => {now += resourceTtl.courses + 1;}};
}
it('deduplicates cold reads and revalidates stale responses without delaying offline reads', async () => {
  const {cache,request,advance} = fixture();
  const load = vi.fn(async () => ({status:'modified' as const,value:'old'}));
  await Promise.all(Array.from({length:20},() => cache.get(request,load)));
  expect(load).toHaveBeenCalledTimes(1);
  advance();
  let finish!: (value: {status:'modified';value:string}) => void;
  const refresh = vi.fn(() => new Promise<{status:'modified';value:string}>(resolve => {finish = resolve;}));
  const stale = await cache.get(request,refresh);
  expect(stale).toMatchObject({value:'old',state:'stale',lastSyncedAt:new Date(1000).toISOString()});
  await cache.get(request,refresh); expect(refresh).toHaveBeenCalledTimes(1);
  finish({status:'modified',value:'new'}); await cache.waitForIdle();
  expect(await cache.get(request,load)).toMatchObject({value:'new',state:'fresh'});
  advance();
  expect(await cache.get({...request,mode:'refresh'},async () => {throw new Error('offline');})).toMatchObject({value:'new',state:'offline'});
});
it('forwards ETag and timeModified validators and invalidates a changed revision', async () => {
  const {cache,request,advance} = fixture();
  await cache.get({...request,revision:'v1'},async () => ({status:'modified',value:'bytes',validators:{etag:'etag',modifiedAt:'12'}})); advance();
  const load = vi.fn(async () => ({status:'unmodified' as const}));
  await cache.get({...request,revision:'v1',mode:'refresh'},load);
  expect(load.mock.calls[0]).toEqual([{etag:'etag',modifiedAt:'12'},expect.any(AbortSignal)]);
  const next = vi.fn(async () => ({status:'modified' as const,value:'changed'}));
  expect((await cache.get({...request,revision:'v2'},next)).value).toBe('changed'); expect(next).toHaveBeenCalledTimes(1);
});
it('bounds bytes and entries with LRU eviction and isolates accounts', async () => {
  const {cache,request,store} = fixture({bytes:30,entries:2,entryBytes:12});
  const load = async () => ({status:'modified' as const,value:'small'});
  await cache.get(request,load); await cache.get({...request,accountId:'b'},load);
  await cache.get(request,load); await cache.get({...request,key:'next'},load);
  expect(store.db.prepare("SELECT accountId,key FROM moodle_response_cache ORDER BY key").all()).toEqual([{accountId:'a',key:'list'},{accountId:'a',key:'next'}]);
  await cache.get({...request,key:'large'},async () => ({status:'modified',value:'too large to persist'}));
  expect(store.db.prepare('SELECT count(*) n,sum(bytes) bytes FROM moodle_response_cache').get()).toMatchObject({n:2,bytes:14});
});
it('purges on sign-out and refuses a late writer even when it ignores cancellation', async () => {
  const {cache,request,store} = fixture();
  let finish!: (value:{status:'modified';value:string}) => void;
  const pending = cache.get(request,() => new Promise(resolve => {finish=resolve;}));
  await Promise.resolve(); cache.clear('a'); finish({status:'modified',value:'private'});
  await expect(pending).rejects.toThrow('Cache purged');
  expect(store.db.prepare('SELECT count(*) n FROM moodle_response_cache').get()?.n).toBe(0);
  await cache.get({...request,accountId:'b'},async () => ({status:'modified',value:'other'}));
  cache.clear('a'); expect(store.db.prepare('SELECT count(*) n FROM moodle_response_cache').get()?.n).toBe(1);
});
it('drops corrupt cached payloads and never hides auth failures', async () => {
  const {cache,request,store} = fixture();
  await cache.get(request,async () => ({status:'modified',value:'data'}));
  await expect(cache.get({...request,mode:'refresh',canUseOffline:() => false},async () => {throw new Error('auth');})).rejects.toThrow('auth');
  store.db.prepare("UPDATE moodle_response_cache SET data='{}'").run();
  await expect(cache.get({...request,mode:'offline'},async () => ({status:'modified',value:'unused'}))).rejects.toThrow('No cached');
});
it('uses indexes for cache lookup, LRU, course conversations and document cascades', () => {
  const {store} = fixture();
  for (const [sql,index] of [
    ["SELECT data FROM moodle_response_cache WHERE accountId='a' AND kind='courses' AND key='list'",'sqlite_autoindex_moodle_response_cache'],
    ['SELECT accountId,kind,key FROM moodle_response_cache ORDER BY accessedAt','moodle_cache_lru'],
    ["SELECT id FROM conversations WHERE courseId='c' ORDER BY createdAt DESC,id DESC",'conversations_course_page'],
    ["SELECT data FROM moodle_notifications WHERE accountId='a' AND json_extract(data,'$.courseId')='c'",'moodle_notifications_course'],
    ["SELECT id FROM moodle_files WHERE documentId='d'",'moodle_files_document'],
  ]) expect(store.db.prepare('EXPLAIN QUERY PLAN '+sql).all().map(row => row.detail).join(' ')).toContain(index);
});
