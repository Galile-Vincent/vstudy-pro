/** Logo fixtures exercise persistence and hostile responses without real network access. */
import { mkdtemp, readdir, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { logoMime, MoodleLogoCache } from './logos';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN/0AAAAASUVORK5CYII=','base64');
const directories: string[] = [];
afterEach(async () => {await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true})));});
async function directory() {const path=await mkdtemp(join(tmpdir(),'vstudy-logos-'));directories.push(path);return path;}
it('fetches once, deduplicates simultaneous callers, and reuses a content-hash file across restarts',async () => {
  const path = await directory(), request = vi.fn<typeof fetch>(async () => new Response(png,{headers:{'content-type':'image/png'}}));
  const cache = new MoodleLogoCache(() => path,request);
  const results = await Promise.all([cache.get('https://school.example/logo.png','https://school.example/moodle'),cache.get('https://school.example/logo.png','https://school.example/moodle')]);
  expect(results).toEqual([`data:image/png;base64,${png.toString('base64')}`,results[0]]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(await new MoodleLogoCache(() => path,request).get('https://school.example/logo.png','https://school.example/moodle')).toBe(results[0]);
  expect(request).toHaveBeenCalledTimes(1);
  expect((await readdir(path)).every(name => /^[a-f0-9]{64}(\.json)?$/.test(name))).toBe(true);
});
it.each(['https://tracker.example/logo.png','http://school.example/logo.png','https://school.example/logo.php?token=secret','https://127.0.0.1/logo.png'])('rejects unsafe or credential-bearing logos %s',async source => {
  const path = await directory(), request = vi.fn<typeof fetch>();
  expect(await new MoodleLogoCache(() => path,request).get(source,'https://school.example')).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
it.each([
  ['image/svg+xml',Buffer.from('<svg><script>alert(1)</script></svg>')],
  ['image/png',Buffer.from('<svg onload="alert(1)"></svg>')],
  ['image/jpeg',png],
  ['image/png',Buffer.alloc(1024*1024+1)],
])('rejects invalid, mismatched, active, or oversized %s',async (mime,bytes) => {
  const path=await directory(),request=vi.fn<typeof fetch>(async () => new Response(bytes,{headers:{'content-type':mime}}));
  expect(await new MoodleLogoCache(() => path,request).get('/logo','https://school.example')).toBeNull();
  expect(await readdir(path)).toEqual([]);
});
it('bounds dimensions as well as compressed byte size',() => {
  const bytes = Buffer.from(png);bytes.writeUInt32BE(100_000,16);
  expect(logoMime(bytes)).toBeNull();
  expect(logoMime(png)).toBe('image/png');
});
it('cancels an oversized streamed response without a content length',async () => {
  const cancel = vi.fn(), path = await directory();
  const request: typeof fetch = async () => new Response(new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(1024*1024+1));},cancel}),{headers:{'content-type':'image/png'}});
  expect(await new MoodleLogoCache(() => path,request).get('/logo','https://school.example')).toBeNull();
  expect(cancel).toHaveBeenCalledOnce();
});

it('bounds persistent logo bytes and clear forces a refetch',async()=>{
  const path=await directory(),request=vi.fn<typeof fetch>(async()=>new Response(png,{headers:{'content-type':'image/png'}}));
  const cache=new MoodleLogoCache(()=>path,request,Date.now,128);
  await cache.get('/first','https://school.example');await cache.get('/second','https://school.example');
  let bytes=0;for(const name of await readdir(path))bytes+=(await lstat(join(path,name))).size;
  expect(bytes).toBeLessThanOrEqual(128);await cache.clear();
  await cache.get('/first','https://school.example');expect(request).toHaveBeenCalledTimes(3);
});
it('revalidates expired logos and keeps a valid offline fallback',async()=>{
  const path=await directory();let now=Date.now();
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(png,{headers:{'content-type':'image/png'}})).mockRejectedValue(new Error('offline'));
  const cache=new MoodleLogoCache(()=>path,request,()=>now);
  const original=await cache.get('/ttl','https://school.example');now+=86400_001;
  expect(await cache.get('/ttl','https://school.example')).toBe(original);expect(request).toHaveBeenCalledTimes(2);
});
