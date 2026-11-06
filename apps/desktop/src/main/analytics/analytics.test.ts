import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore, type Store } from '../db';
import { AnalyticsService, setAnalytics } from './service';
import { sanitizeEvent } from './schema';
import { deviceProperties } from './device';
import { tokenProperties, instrumentProvider, requestMetadata, classifyError } from './provider';
import { extractUsage } from '../providers/usage';
import { AnalyticsActivity } from './activity';
import { analyticsConfig } from './config';
import type { ProviderRequest } from '../providers';

const device=deviceProperties({platform:'darwin',os:'15.1.9',arch:'arm64',version:'0.3.0',language:'zh-Hant',memory:15.9,cores:10,width:1728,scale:2,electron:'42.11.16',chrome:'140.2.4'});
const stores:Store[]=[];
function setup(request=vi.fn<typeof fetch>().mockResolvedValue(new Response(null)),now=()=>1000) {
  const store=openStore(':memory:');stores.push(store);
  const service=new AnalyticsService(store.db,{enabled:true,host:'https://us.i.posthog.com',key:'public-test'},device,request,now);
  const queued=()=>store.db.prepare('SELECT payload FROM analytics_queue ORDER BY sequence').all().map(row=>JSON.parse(String(row.payload)));
  return {store,service,request,queued};
}
afterEach(()=>{setAnalytics(undefined);for(const store of stores.splice(0))store.close();});
describe('privacy boundary',()=>{
  it('drops unknown events and strips unknown properties',()=>{
    expect(sanitizeEvent('not_allowed',{email:'me@example.com'})).toBeNull();
    expect(sanitizeEvent('app_error',{error_category:'network',feature:'chat',message:'/Users/private',email:'me@example.com'})).toEqual({error_category:'network',feature:'chat'});
  });
  it.each(['me@example.com','https://example.com','/Users/private','C:\\Users\\private','sk-123456789','phc_abcdefgh','api_key','foo.example.com','secret-token','Bearer abc'])('rejects sensitive model shape %s',value=>{
    expect(sanitizeEvent('ai_request_started',{request_id:randomUUID(),conversation_id:null,provider:'openai-api',model:value,reasoning_effort:null,integration_type:'api',ai_feature:'chat',context_source:'direct_chat'})).toMatchObject({model:'custom'});
  });
  it('keeps only coarse device data',()=>{
    expect(device).toMatchObject({os_version:'15.1',memory_bucket:'16',cpu_cores_bucket:'16',display_size_bucket:'medium',electron_major:42,chrome_major:140});
    expect(deviceProperties({platform:'win32',os:'10.0.22631',arch:'x64',version:'1.0.0',language:'en',memory:64,cores:32,width:3840,scale:2.5,electron:'42.0',chrome:'140.0'})).toMatchObject({os_version:'10.0',memory_bucket:'>32',display_size_bucket:'large'});
    expect(()=>deviceProperties({platform:'darwin',os:'15.1',arch:'arm64',version:'my@email.com',language:'en',memory:8,cores:4,width:1200,scale:1,electron:'42',chrome:'140'})).toThrow();
  });
  it('is inert in dev and tests unless explicitly enabled',()=>{
    expect(analyticsConfig(false,{NODE_ENV:'development'})?.enabled).toBe(false);
    expect(analyticsConfig(true,{NODE_ENV:'test'})?.enabled).toBe(false);
    expect(analyticsConfig(false,{VSTUDY_ANALYTICS_ENABLE:'1'})?.enabled).toBe(true);
  });
});
describe('consent and durable queue',()=>{
  it('sends and queues nothing without consent and never replays withheld events',async()=>{
    const {service,queued,request}=setup();
    service.track('app_opened',device);await service.flush();
    expect(queued()).toEqual([]);expect(request).not.toHaveBeenCalled();
    service.setConsent(true);await service.flush();
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body)).batch.filter((e:{event:string})=>e.event==='app_opened')).toHaveLength(1);
    service.track('app_opened',device);service.setConsent(false);await service.flush();expect(queued()).toEqual([]);
    service.setConsent(true);expect(queued().some(event=>event.event==='app_opened')).toBe(false);
  });
  it('persists identity and retries the same UUID after offline failure and restart',async()=>{
    let now=1000;
    const request=vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(null));
    const {store,service,queued}=setup(request,()=>now);
    service.setConsent(true);service.track('app_opened',device);
    const original=queued();await service.flush();expect(queued()).toEqual(original);
    await service.flush();expect(request).toHaveBeenCalledTimes(1);
    now+=10_000;await service.flush();expect(queued()).toEqual([]);
    const restored=new AnalyticsService(store.db,{enabled:true,host:'https://us.i.posthog.com',key:'public-test'},device,request);
    restored.track('app_opened',device);
    expect(queued()[0].distinct_id).toBe(original[0].distinct_id);
    const sent=JSON.parse(String(request.mock.calls[1]![1]!.body));expect(sent.batch).toEqual(original);
    expect(sent.batch[0].properties.$geoip_disable).toBe(true);
  });
  it('deduplicates and bounds the persistent queue',()=>{
    const {service,queued}=setup();service.setConsent(true);
    const id=randomUUID();service.track('app_focused',{},id);service.track('app_focused',{},id);
    expect(queued().filter(event=>event.uuid===id)).toHaveLength(1);
    for(let i=0;i<550;i++)service.track('app_focused');expect(queued()).toHaveLength(500);
  });
  it('aborts an in-flight send and clears the queue on opt-out',async()=>{
    let signal:AbortSignal|undefined;
    const request=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{signal=init?.signal as AbortSignal;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('aborted'))));});
    const {service,queued}=setup(request);service.setConsent(true);const pending=service.flush();service.setConsent(false);await pending;
    expect(signal?.aborted).toBe(true);expect(queued()).toEqual([]);
  });
  it('only updates school profiles when changed',()=>{
    const {service,queued}=setup();service.setConsent(true);
    service.school({id:'cycu',name:'Chung Yuan Christian University'});
    const length=queued().length;
    service.school({id:'cycu',name:'Chung Yuan Christian University'});expect(queued()).toHaveLength(length);
    service.school({id:'ucl',name:'University College London'});expect(queued()).toHaveLength(length);
    service.school(null);expect(queued().at(-1).properties.$set.school_id).toBeNull();
  });
  it('rejects renderer duplicates of main-owned events',()=>{
    const {service,queued}=setup();service.setConsent(true);const length=queued().length;
    service.rendererTrack('app_opened',device);service.rendererTrack('ai_request_started',{});expect(queued()).toHaveLength(length);
    service.rendererTrack('settings_opened',{settings_section:'privacy'});expect(queued()).toHaveLength(length+1);
  });
  it('records a local deletion request and disables telemetry',()=>{
    const {service,queued}=setup();service.setConsent(true);expect(service.requestDeletion()).toMatchObject({pending:true,method:'contact'});
    expect(service.getState()).toMatchObject({enabled:false,deletion_pending:true});expect(queued()).toEqual([]);
  });
});
it('preserves unknown tokens as null before local estimates',()=>{
  expect(tokenProperties()).toMatchObject({input_tokens:null,output_tokens:null,total_tokens:null});
  const usage=extractUsage('{"usage":{"output_tokens":8}}','openai');
  expect(tokenProperties(usage)).toMatchObject({input_tokens:null,output_tokens:8,total_tokens:null});
  expect(tokenProperties({inputTokens:30,outputTokens:20,costSource:'estimated'}).input_tokens).toBeNull();
  expect(tokenProperties(extractUsage('{"usage":{"input_tokens":0,"output_tokens":0}}','openai'))).toMatchObject({input_tokens:0,output_tokens:0,total_tokens:0});
});
it('measures foreground idle and background separately and resets withheld activity',()=>{
  let now=0,idle=0;
  const {service,queued}=setup();service.setConsent(true);
  const activity=new AnalyticsActivity(service,()=>idle,()=>now);activity.focus(true);for(now=5000;now<=30_000;now+=5000)activity.sample();idle=301;for(now=35_000;now<=60_000;now+=5000)activity.sample();now=60_000;activity.focus(false);for(now=65_000;now<=90_000;now+=5000)activity.sample();now=90_000;
  expect(queued().find(event=>event.event==='app_activity_summary').properties).toMatchObject({active_ms:30_000,idle_ms:30_000,background_ms:30_000});
  activity.reset();now+=10;activity.end();expect(queued().at(-2).properties.elapsed_ms).toBe(10);
});
it('instruments real stream completion once without any prompt content',async()=>{
  const {service,queued}=setup();service.setConsent(true);setAnalytics(service);
  const provider=instrumentProvider({detect:async()=>({available:true}),listModels:async()=>[],async *stream(){yield {type:'text-delta' as const,text:'private reply'};yield {type:'done' as const};}});
  const request={requestId:randomUUID(),conversationId:randomUUID(),providerId:'openai-api',modelId:'gpt-5',scope:'general',prompt:'private prompt',userMessage:'secret question'} as ProviderRequest;
  for await(const event of provider.stream(request,new AbortController().signal)) expect(event).toBeDefined();
  expect(queued().filter(event=>event.event==='ai_request_completed')).toHaveLength(1);
  expect(JSON.stringify(queued())).not.toMatch(/private|secret question/);
  expect(queued().at(-1).properties.input_tokens).toBeNull();
});

it('recovers after gateway storage failures without throwing into studying',()=>{
  const {service,store}=setup();service.setConsent(true);store.db.exec('DROP TABLE analytics_queue');
  expect(()=>service.track('app_focused')).not.toThrow();expect(()=>service.setConsent(false)).not.toThrow();
  expect(service.getState().enabled).toBe(false);
});
it('rejects email addresses at the onboarding IPC boundary',async()=>{
  const {ipcContract}=await import('../../shared/ipc');
  expect(ipcContract['analytics:completeOnboarding'].request.safeParse({acquisition_source:'github',email_provided:true,updates_opted_in:false,duration_ms:4000,email:'private@example.com'}).success).toBe(false);
});
it('uses exact verified school sites and never guesses from hostname substrings',async()=>{
  const {resolveSchool}=await import('./school');
  expect(resolveSchool('https://ilearning.cycu.edu.tw')).toEqual({id:'cycu',name:'Chung Yuan Christian University'});
  expect(resolveSchool('https://ilearning.cycu.edu.tw.evil.example')).toBeNull();
  expect(resolveSchool('https://unknown.example')).toBeNull();
  expect(resolveSchool('https://moodle.ucl.ac.uk/other-school')).toBeNull();
});
it('does not resend an acknowledged unchanged device profile',async()=>{
  const {service,queued,store,request}=setup();service.setConsent(true);await service.flush();
  service.profile();expect(queued()).toEqual([]);
  const restarted=new AnalyticsService(store.db,{enabled:true,host:'https://us.i.posthog.com',key:'public-test'},device,request);
  restarted.profile();expect(queued()).toEqual([]);
});
it('revalidates persisted envelopes and drops unknown queue properties',async()=>{
  const {service,store,request}=setup();service.setConsent(true);service.track('app_focused');
  const row=store.db.prepare("SELECT event_id,payload FROM analytics_queue WHERE json_extract(payload,'$.event')='app_focused'").get()!;
  const event=JSON.parse(String(row.payload));event.properties.email='private@example.com';event.properties.path='/Users/private';
  store.db.prepare('UPDATE analytics_queue SET payload=? WHERE event_id=?').run(JSON.stringify(event),String(row.event_id));
  await service.flush();expect(JSON.stringify(request.mock.calls)).not.toMatch(/private@example.com|Users/);
});
it('does not invent reasoning tokens in CLI model aggregates',async()=>{
  const {parseStream}=await import('../providers/parsers');
  async function* chunks(){yield JSON.stringify({type:'result',usage:{input_tokens:1,output_tokens:2},modelUsage:{'claude-sonnet-5-5':{inputTokens:1,outputTokens:2,cacheReadInputTokens:0,cacheCreationInputTokens:0,costUSD:0.001}}})+'\n';}
  const events=[];for await(const event of parseStream(chunks(),'claude'))events.push(event);
  const usage=events.find(event=>event.type==='usage');
  expect(usage?.type === 'usage' && tokenProperties(usage.usage).reasoning_tokens).toBeNull();
});

it('keeps only the newest school profile even when switching back to the acknowledged school',async()=>{
  const {service,queued,request}=setup();service.setConsent(true);
  const a={id:'cycu',name:'Chung Yuan Christian University'};
  service.school(a);await service.flush();
  service.school({id:'ucl',name:'University College London'});service.school(a);
  expect(queued().filter(e=>e.event==='$identify')).toHaveLength(1);
  await service.flush();expect(JSON.stringify(request.mock.calls.at(-1))).not.toContain('University College London');
});
it('emits launch and buffered onboarding only after consent and completes once',async()=>{
  const {service,queued,store,request}=setup();service.start();
  service.rendererTrack('onboarding_started',{onboarding_version:1});expect(queued()).toEqual([]);
  service.setConsent(true);
  const input={acquisition_source:'github' as const,email_provided:false,updates_opted_in:false,duration_ms:100};
  service.completeOnboarding(input);service.completeOnboarding(input);service.setConsent(false);service.setConsent(true);
  expect(queued().some(e=>e.event==='app_opened')).toBe(false);
  expect(service.getState().onboarding).toEqual(input);
  const restored=new AnalyticsService(store.db,{enabled:true,host:'https://us.i.posthog.com',key:'test'},device,request);
  restored.start();expect(queued().filter(e=>e.event==='app_first_opened')).toHaveLength(0);
  await service.stop();await restored.stop();
});
it('queues exactly one launch pair and onboarding pair for a newly consenting installation',async()=>{
  const {service,queued}=setup();service.start();service.rendererTrack('onboarding_started',{onboarding_version:1});service.setConsent(true);
  const input={acquisition_source:'github' as const,email_provided:false,updates_opted_in:false,duration_ms:1};
  service.completeOnboarding(input);service.completeOnboarding(input);
  for(const name of ['app_first_opened','app_opened','onboarding_started','onboarding_completed'])expect(queued().filter(e=>e.event===name)).toHaveLength(1);
  await service.stop();
});
it('declining onboarding sends nothing including the local start marker',()=>{
  const {service,queued,request}=setup();service.rendererTrack('onboarding_started',{onboarding_version:1});service.setConsent(false);
  service.completeOnboarding({acquisition_source:'other',email_provided:false,updates_opted_in:false,duration_ms:1});
  expect(queued()).toEqual([]);expect(request).not.toHaveBeenCalled();
});
it('rotates the installation after deletion before permitting new events',()=>{
  const {service,queued,store,request}=setup();service.setConsent(true);const deleted=service.requestDeletion().installation_id;
  const restored=new AnalyticsService(store.db,{enabled:true,host:'https://us.i.posthog.com',key:'test'},device,request);
  expect(restored.track('app_focused')).toBe(false);expect(queued()).toEqual([]);
  restored.setConsent(true);restored.track('app_focused');
  expect(restored.getState().deletion_pending).toBe(false);expect(queued().every(e=>e.distinct_id!==deleted)).toBe(true);
});
it('counts an eight-hour suspended foreground gap as background',()=>{
  let now=0;const {service,queued}=setup();service.setConsent(true);
  const activity=new AnalyticsActivity(service,()=>0,()=>now);activity.focus(true);now=8*60*60*1000;activity.sample();
  expect(queued().find(e=>e.event==='app_activity_summary').properties).toMatchObject({active_ms:0,idle_ms:0,background_ms:now});
});
it.each(['reasoning_effort','reasoningEffort','effort'])('reads raw effort from %s',key=>{
  expect(requestMetadata({providerId:'openai-api',modelId:'gpt-4.1',options:{[key]:'ultra'}} as unknown as ProviderRequest).reasoning_effort).toBe('ultra');
});
it.each([['auth failed','auth'],['rate limited','rate_limit'],['network','network'],['TimeoutError','timeout'],['server error','provider_error'],['unrecognized','other']])('classifies %s without emitting the error text', (category,expected)=>{
  expect(classifyError({category})).toBe(expected);
});
it.each(['gpt-4.1','gpt-6.1-sol','claude-sonnet-4-6'])('accepts known model %s without dropping the event',model=>{
  const {service,queued}=setup();service.setConsent(true);
  expect(service.track('ai_request_started',{request_id:randomUUID(),conversation_id:null,provider:model.startsWith('claude')?'claude-cli':'openai-api',model,reasoning_effort:null,integration_type:'api',ai_feature:'chat',context_source:'direct_chat'})).toBe(true);
  expect(queued().at(-1).properties.model).toBe(model);
});
it.each(['ft:gpt-4o:alice-smith:private-thesis:AbC123','my/private.model','private-model'])('replaces private model %s at the gateway',model=>{
  const {service,queued}=setup();service.setConsent(true);
  service.track('ai_request_started',{request_id:randomUUID(),conversation_id:null,provider:'openai-api',model,reasoning_effort:null,integration_type:'api',ai_feature:'chat',context_source:'direct_chat'});
  expect(queued().at(-1).properties.model).toBe('custom');
});
it('never discloses compatible endpoint models even when named like a public model',()=>{
  expect(requestMetadata({providerId:'openai-compatible',modelId:'gpt-4.1'} as ProviderRequest).model).toBe('custom');
});

it('keeps unknown effort null',()=>{
  expect(requestMetadata({providerId:'openai-api',modelId:'gpt-5'} as ProviderRequest).reasoning_effort).toBeNull();
});
it('sanitizes the actual usage model snapshot and classifies a streamed failure',async()=>{
  const {service,queued}=setup();service.setConsent(true);setAnalytics(service);
  const provider=instrumentProvider({detect:async()=>({available:true}),listModels:async()=>[],async *stream(request){
    request.onUsageSnapshot?.({inputTokens:1,outputTokens:2,costSource:'reported'},[{modelId:'ft:gpt-4o:alice:thesis:123',usage:{inputTokens:1,outputTokens:2,costSource:'reported'}}]);
    yield {type:'error' as const,message:'private diagnostics',code:'rate limited'};
  }});
  for await(const event of provider.stream({requestId:randomUUID(),providerId:'openai-api',modelId:'gpt-4.1',scope:'general'} as ProviderRequest,new AbortController().signal))expect(event.type).toBe('error');
  expect(queued().at(-1).properties).toMatchObject({model:'custom',error_category:'rate_limit'});
  expect(JSON.stringify(queued())).not.toMatch(/alice|thesis|private diagnostics/);
});
