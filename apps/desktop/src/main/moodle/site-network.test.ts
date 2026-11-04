import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { createMoodleFetch } from './site-url';
const mock = vi.hoisted(() => ({responses:[] as {status:number;location?:string}[],lookups:[] as unknown[],options:[] as RequestOptions[]}));
vi.mock('node:https',() => ({request:(url:URL,options:RequestOptions,receive:(response:IncomingMessage) => void) => {
  const req = Object.assign(new EventEmitter(),{write:vi.fn(),end:() => {
    mock.options.push(options);
    options.lookup!(url.hostname,{all:true},(error,addresses) => {
      if (error) {req.emit('error',error);return;}
      mock.lookups.push(addresses);
      const response = mock.responses.shift() ?? {status:200};
      receive(Object.assign(Readable.from([Buffer.from('{"ok":true}')]),{statusCode:response.status,headers:response.location ? {location:response.location} : {}}) as IncomingMessage);
    });
  }});
  return req;
}}));
beforeEach(() => {mock.responses.length = 0;mock.lookups.length = 0;mock.options.length = 0;});
it('resolves public addresses inside each connection and rejects a rebound private answer',async () => {
  const resolver = vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'127.0.0.1',family:4}]);
  const request = createMoodleFetch(resolver);
  expect(await (await request('https://school.example/api')).json()).toEqual({ok:true});
  await expect(request('https://school.example/api')).rejects.toThrow('Unsafe Moodle host address');
  expect(mock.lookups).toEqual([[{address:'8.8.8.8',family:4}]]);
  expect(mock.options.map(options => ({agent:options.agent,rejectUnauthorized:options.rejectUnauthorized}))).toEqual([{agent:false,rejectUnauthorized:true},{agent:false,rejectUnauthorized:true}]);
});
it('rejects a cross-origin redirect without opening another connection',async () => {
  mock.responses.push({status:307,location:'https://evil.example/api'});
  const resolver = vi.fn(async () => [{address:'8.8.8.8',family:4}]);
  await expect(createMoodleFetch(resolver)('https://school.example/api',{method:'POST',body:'password=secret'})).rejects.toThrow('outside site root');
  expect(resolver.mock.calls).toEqual([['school.example']]);
});
it('checks DNS again for every allowed redirect hop',async () => {
  mock.responses.push({status:307,location:'/next'});
  const resolver = vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'::1',family:6}]);
  await expect(createMoodleFetch(resolver)('https://school.example/api')).rejects.toThrow('Unsafe Moodle host address');
  expect(resolver.mock.calls).toEqual([['school.example'],['school.example']]);
});
it('returns empty HTTP responses without constructing an invalid response body',async () => {
  mock.responses.push({status:204});
  const response = await createMoodleFetch(async () => [{address:'8.8.8.8',family:4}])('https://school.example/api');
  expect(response.status).toBe(204);expect(await response.text()).toBe('');
});
it('passes only public answers to the connection lookup',async () => {
  const response = await createMoodleFetch(async () => [{address:'169.254.169.254',family:4},{address:'100.64.0.1',family:4},{address:'8.8.8.8',family:4}])('https://school.example/api');
  expect(await response.json()).toEqual({ok:true});
  expect(mock.lookups).toEqual([[{address:'8.8.8.8',family:4}]]);
});
