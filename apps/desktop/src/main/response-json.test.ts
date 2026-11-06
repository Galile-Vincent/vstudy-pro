/** Bounded HTTP JSON regressions at the public Moodle and provider entry points. @packageDocumentation */
import { expect, it, vi } from 'vitest';
import { checkSite } from './moodle/discovery';
import { MoodleClient, passwordToken } from './moodle/client';
import { createApiAdapter } from './providers/api';
import { readBoundedJson } from './response-json';

it('accepts valid UTF-8 JSON at exactly the 16 MiB byte limit',async () => {
  const payload = Buffer.from(JSON.stringify({name:'課程'}));
  const body = Buffer.concat([Buffer.alloc(16*1024*1024-payload.length,32),payload]);
  expect(await readBoundedJson(new Response(body))).toEqual({value:{name:'課程'},bytes:body.length});
});

const endpoints = [
  {name:'discovery',payload:[{error:false,data:{sitename:'School'}}],run:(request:typeof fetch) => checkSite('https://school.example/moodle',request),failure:'Moodle discovery failed'},
  {name:'password token',payload:{token:'valid'},run:(request:typeof fetch) => passwordToken('https://school.example','student','password',request),failure:'Moodle service error'},
  {name:'authenticated Moodle',payload:{userid:42,fullname:'Student'},run:(request:typeof fetch) => new MoodleClient('https://school.example','token',request).siteInfo(),failure:'Moodle service error'},
  {name:'provider models',payload:{data:[{id:'model'}]},run:(request:typeof fetch) => createApiAdapter(() => ({id:'openai-api',kind:'api',enabled:true}),{getInMainOnly:() => 'key'},request).listModels(),failure:null},
];
for (const endpoint of endpoints) {
  it(`accepts a UTF-8 BOM at the ${endpoint.name} entry point`,async () => {
    const plain = await endpoint.run(async () => Response.json(endpoint.payload));
    const request:typeof fetch = async () => new Response('\uFEFF'+JSON.stringify(endpoint.payload));
    expect(await endpoint.run(request)).toEqual(plain);
  });
  it(`caps decompressed streamed JSON bytes and cancels oversized ${endpoint.name} responses`,async () => {
    const cancellations:ReturnType<typeof vi.fn>[] = [];
    const request:typeof fetch = async () => {
      const cancel = vi.fn();cancellations.push(cancel);
      let chunks = 0;
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(chunks++ < 17 ? new Uint8Array(1024*1024).fill(32) : new TextEncoder().encode(JSON.stringify(endpoint.payload)));
          if (chunks === 18) controller.close();
        },cancel,
      }),{headers:{'content-length':'1','content-encoding':'gzip'}});
    };
    if (endpoint.failure) await expect(endpoint.run(request)).rejects.toThrow(endpoint.failure);
    else expect(await endpoint.run(request)).toEqual([]);
    expect(cancellations.length).toBeGreaterThan(0);
    expect(cancellations.every(cancel => cancel.mock.calls.length === 1)).toBe(true);
  });
  it(`rejects truncated ${endpoint.name} JSON without publishing partial data`,async () => {
    const request:typeof fetch = async () => new Response(JSON.stringify(endpoint.payload).slice(0,-1));
    if (endpoint.failure) await expect(endpoint.run(request)).rejects.toThrow(endpoint.failure);
    else expect(await endpoint.run(request)).toEqual([]);
  });
  it(`rejects interrupted ${endpoint.name} bodies without exposing transport details`,async () => {
    const request:typeof fetch = async () => {
      let started = false;
      return new Response(new ReadableStream<Uint8Array>({pull(controller) {
        if (started) throw new Error('private transport details');
        started = true;controller.enqueue(new TextEncoder().encode('{'));
      }}));
    };
    if (endpoint.failure) await expect(endpoint.run(request)).rejects.toThrow(endpoint.name === 'discovery' ? endpoint.failure : 'Moodle network error');
    else expect(await endpoint.run(request)).toEqual([]);
  });
}
