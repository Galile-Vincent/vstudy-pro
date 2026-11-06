import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('electron',()=>({app:{getVersion:()=> '0.3.0'}}));
import { createIpcRegistrar } from './register';
import type { IpcMainInvokeEvent } from 'electron';
import type { IpcChannel } from '../../shared';
import { networkActivity } from '../services/egress';
const request={email:'student@example.org',locale:'en',source:'onboarding',consent:true};
beforeEach(()=>{vi.resetModules();});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function setup(endpoint:string) {
  vi.stubEnv('VSTUDY_NEWSLETTER_URL',endpoint);
  vi.stubEnv('VSTUDY_NEWSLETTER_ORIGINS','https://example.org');
  const {registerNewsletterIpc}=await import('./newsletter');
  const handlers=new Map<string,(event:IpcMainInvokeEvent,input:unknown)=>unknown>();
  const registrar=createIpcRegistrar({handle:(c,h)=>{handlers.set(c,h);},removeHandler:()=>{}},()=>true);
  registerNewsletterIpc(registrar,new Set<IpcChannel>());
  return (channel:string,input:unknown)=>handlers.get(channel)!({} as IpcMainInvokeEvent,input);
}
it('hides an unset or insecure deployment and never sends',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 for(const endpoint of ['', 'http://example.org/subscribe']) {
  vi.resetModules();const invoke=await setup(endpoint);
  expect(await invoke('newsletter:getConfig',{})).toEqual({available:false});
  expect(await invoke('newsletter:subscribe',request)).toEqual({accepted:false});
 }
 expect(fetch).not.toHaveBeenCalled();
});
it('validates explicit consent and address before any network access',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const invoke=await setup('https://example.org/subscribe');
 await expect(invoke('newsletter:subscribe',{...request,consent:false})).rejects.toThrow();
 await expect(invoke('newsletter:subscribe',{...request,email:'invalid'})).rejects.toThrow();
 expect(fetch).not.toHaveBeenCalled();
});
it('sends only the contract and records origin, never address, in network inventory',async()=>{
 const fetch=vi.fn<(url:string, options:RequestInit)=>Promise<Response>>(async()=>new Response(JSON.stringify({status:'accepted'})));vi.stubGlobal('fetch',fetch);
 const invoke=await setup('https://example.org/subscribe');
 expect(await invoke('newsletter:subscribe',request)).toEqual({accepted:true});
 expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({...request,app_version:'0.3.0'});
 const {networkActivity:inventory}=await import('../services/egress');
 expect(inventory().at(-1)).toMatchObject({what:'newsletter_subscribe',to:'https://example.org'});
 expect(JSON.stringify([...inventory(),...networkActivity()])).not.toContain(request.email);
});
it('returns a gentle failure for delivery errors without exposing server text',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('private server diagnostics');}));
 const invoke=await setup('https://example.org/subscribe');
 expect(await invoke('newsletter:subscribe',request)).toEqual({accepted:false});
});

it('requires an exact configured HTTPS origin allowlist',async()=>{
  const {newsletterEndpoint}=await import('./newsletter');
  expect(newsletterEndpoint('https://example.org/subscribe','https://example.org')).toBe('https://example.org/subscribe');
  for(const value of ['https://example.org.evil/subscribe','https://evil.org/subscribe','http://example.org/subscribe','https://user:pass@example.org/subscribe']) expect(newsletterEndpoint(value,'https://example.org')).toBeUndefined();
  expect(newsletterEndpoint('https://example.org/subscribe','')).toBeUndefined();
});

it('uses injected build configuration without a runtime environment',async()=>{
  vi.stubEnv('VSTUDY_NEWSLETTER_URL',undefined);vi.stubEnv('VSTUDY_NEWSLETTER_ORIGINS',undefined);
  vi.stubGlobal('__NEWSLETTER_URL__','https://release.example/subscribe');
  vi.stubGlobal('__NEWSLETTER_ORIGINS__','https://release.example');
  const {newsletterEndpoint}=await import('./newsletter');
  expect(newsletterEndpoint()).toBe('https://release.example/subscribe');
});
