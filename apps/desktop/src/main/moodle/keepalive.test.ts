/**
 * Regression coverage for moodle keepalive.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMoodleFetch, connectionTiming } from './site-url';

const harness = vi.hoisted(() => ({port:0}));
vi.mock('node:https',async importOriginal => {
  const actual=await importOriginal<typeof import('node:https')>();
  return {...actual,request:((url:URL,options:import('node:https').RequestOptions,receive:(res:import('node:http').IncomingMessage)=>void) => actual.request(url,{...options,port:harness.port,rejectUnauthorized:false,lookup:(host,lookupOptions,callback) => {
    options.lookup!(host,lookupOptions,(error) => {
      if(error) callback(error,'',4);
      else if(lookupOptions.all) callback(null,[{address:'127.0.0.1',family:4}]);
      else callback(null,'127.0.0.1',4);
    });
  }},receive))};
});
it('reuses only the established origin socket and validates DNS again after it closes',async () => {
  const directory=mkdtempSync(join(tmpdir(),'moodle-pool-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key'),'-out',join(directory,'cert'),'-subj','/CN=school.example','-days','1'],{stdio:'ignore'});
  let connections=0,requests=0;
  const server=createServer({key:readFileSync(join(directory,'key')),cert:readFileSync(join(directory,'cert'))},(req,res) => {
    requests++;
    if(req.url === '/redirect') {res.statusCode=307;res.setHeader('Location','https://127.0.0.1/secret');}
    res.end('{"ok":true}');
  });
  server.on('secureConnection',() => {connections++;});
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address || typeof address === 'string') throw new Error('No TLS port');
  harness.port=address.port;
  const resolver=vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValue([{address:'127.0.0.1',family:4}]);
  const fetch=createMoodleFetch(resolver);
  try {
    const first=await fetch('https://school.example/api');
    expect(await first.json()).toEqual({ok:true});
    await new Promise<void>(resolve => setImmediate(resolve));
    const reused=await fetch('https://school.example/api');
    expect(await reused.json()).toEqual({ok:true});
    expect(connectionTiming.get(reused)?.reused).toBe(true);
    expect(connections).toBe(1);expect(resolver).toHaveBeenCalledTimes(1);
    await expect(fetch('https://school.example/redirect')).rejects.toThrow('Unsafe Moodle site URL');
    expect(requests).toBe(3);
    server.closeAllConnections();
    await new Promise<void>(resolve => setImmediate(resolve));
    await expect(fetch('https://school.example/api')).rejects.toThrow('Unsafe Moodle host address');
    expect(resolver).toHaveBeenCalledTimes(2);expect(requests).toBe(3);
  } finally {server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve()));rmSync(directory,{recursive:true,force:true});}
});
