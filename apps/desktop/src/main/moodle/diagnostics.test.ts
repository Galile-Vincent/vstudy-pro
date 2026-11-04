import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MoodleClient, MoodleError } from './client';
import { account, fixtureFetch } from './fixtures/support';
import { redact } from '../logging';

it('logs only diagnostic metadata and structure, never response string values',async () => {
 const logger=vi.spyOn(console,'log').mockImplementation(() => {});
 vi.stubEnv('MOODLE_DEBUG_SHAPES','1');
 try {
 const canary='PRIVATE_CANARY_78291';
 const client=new MoodleClient(account.siteUrl,canary,fixtureFetch({bad:{rows:[{id:canary,description:canary}],message:canary,debuginfo:canary},exception:{exception:'moodle_exception',errorcode:'invalidparameter',message:canary,debuginfo:canary,backtrace:canary}}));
 await expect(client.call('bad',{},z.object({rows:z.array(z.object({id:z.number()}))})) ).rejects.toMatchObject({kind:'service'});
 await expect(client.call('exception',{},z.object({}))).rejects.toMatchObject({kind:'service'});
 const logs=logger.mock.calls.map(call => redact(call[0])).join('\n');
 expect(logs).not.toContain(canary);
 expect(logs).toContain('rows.0.id');
 expect(logs).toContain('invalid_type');
 expect(logs).toContain('invalidparameter');
 expect(logs).toContain('moodle_exception');
 expect(logs).toContain('shape');
 } finally {logger.mockRestore();vi.unstubAllEnvs();}
});

it.each(['accessexception','invalidparameter','requireloginerror','functionnotavailable'])('caches permanent %s failures across clients for an account session',async errorcode => {
 const cache=new Map<string,MoodleError>();
 const request=fixtureFetch({mod_assign_get_submission_status:{errorcode,exception:'moodle_exception'}});
 const client=new MoodleClient(account.siteUrl,'token',request,undefined,cache);
 const courses=await client.courses(account);
 expect(await client.assignments(account.id,courses)).toMatchObject([{submitted:null}]);
 const next=new MoodleClient(account.siteUrl,'token',request,undefined,cache);
 expect(await next.assignments(account.id,courses)).toMatchObject([{submitted:null}]);
 expect(request.mock.calls.filter(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction') === 'mod_assign_get_submission_status')).toHaveLength(1);
 const another=new MoodleClient(account.siteUrl,'token',request);
 await another.assignments(account.id,courses);
 expect(request.mock.calls.filter(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction') === 'mod_assign_get_submission_status')).toHaveLength(2);
});

it('sends explicit assignment and quiz status parameters',async () => {
 const request=fixtureFetch();
 const client=new MoodleClient(account.siteUrl,'token',request);
 await client.siteInfo();
 const courses=await client.courses(account);
 await client.assignments(account.id,courses);
 await client.events(account.id,courses);
 const params=request.mock.calls.map(call => Object.fromEntries(new URLSearchParams(String(call[1]?.body))));
 expect(params).toContainEqual(expect.objectContaining({wsfunction:'mod_assign_get_submission_status',assignid:'201',userid:'42',groupid:'0'}));
 expect(params).toContainEqual(expect.objectContaining({wsfunction:'mod_quiz_get_user_attempts',userid:'42',status:'all',includepreviews:'0'}));
});

it('requires mobile config advertisement and caches its failure',async () => {
 const request=fixtureFetch({tool_mobile_get_config:{errorcode:'unexpected',message:'private'}});
 const client=new MoodleClient(account.siteUrl,'token',request);
 expect(() => client.mobileConfig()).toThrow('unsupported');
 client.setFunctions(['tool_mobile_get_config']);
 await expect(client.mobileConfig()).rejects.toThrow('service');
 await expect(client.mobileConfig()).rejects.toThrow('service');
 expect(request).toHaveBeenCalledTimes(1);
});

it('bounds issue lists and debug shapes and excludes shape by default',async () => {
 const logger=vi.spyOn(console,'log').mockImplementation(() => {});
 try {
 const request=fixtureFetch({bad:{rows:Array.from({length:30},() => ({id:'private'}))}});
 const client=new MoodleClient(account.siteUrl,'token',request);
 await expect(client.call('bad',{},z.object({rows:z.array(z.object({id:z.number()}))}))).rejects.toThrow();
 const entry=JSON.parse(String(logger.mock.calls[0]![0]));
 expect(entry.diagnostic.issues).toHaveLength(10);
 expect(entry.diagnostic.shape).toBeUndefined();
 } finally {logger.mockRestore();}
});

it('keeps transient status failures retryable and never suppresses expired tokens',async () => {
 for (const errorcode of ['temporaryfailure','invalidtoken']) {
  const request=fixtureFetch({mod_quiz_get_user_attempts:{errorcode}});
  const client=new MoodleClient(account.siteUrl,'token',request);
  for (let index=0;index<2;index++) await expect(client.call('mod_quiz_get_user_attempts',{},z.object({}))).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
 }
});
it('suppresses repeated quiz permission failures while retaining unknown state',async () => {
 const request=fixtureFetch({mod_quiz_get_user_attempts:{errorcode:'accessexception'}});
 const client=new MoodleClient(account.siteUrl,'token',request);
 const courses=await client.courses(account);
 for (let index=0;index<2;index++) expect(await client.events(account.id,courses)).toContainEqual(expect.objectContaining({kind:'quiz',submitted:null}));
 expect(request.mock.calls.filter(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction') === 'mod_quiz_get_user_attempts')).toHaveLength(1);
});

it('caps shape output at 4 KB and hides query-bearing keys',async () => {
 const {responseShape}=await import('./diagnostics');
 vi.stubEnv('MOODLE_DEBUG_SHAPES','1');
 try {
 const shape=responseShape({'https://example.test/?token=CANARY': 'PRIVATE',rows:Array.from({length:100},() => Object.fromEntries(Array.from({length:100},(_,index) => ['long_field_name_'+index,'PRIVATE'])))});
 expect(Buffer.byteLength(shape!)).toBeLessThanOrEqual(4096);
 expect(shape).not.toContain('CANARY');
 expect(shape).not.toContain('PRIVATE');
 expect(shape).toContain('100');
 } finally {vi.unstubAllEnvs();}
});
