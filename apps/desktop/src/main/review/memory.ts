import { randomUUID } from 'node:crypto';
import type { Store } from '../db';
import type { ProviderRegistry } from '../providers';
import { providerIdSchema } from '../../shared/domain';
import { MemoryRepository, type MemoryJob, type MemoryResult } from './memory-repository';
import { guardExtraction } from './extract-schema';
import { buildExtractionPrompt } from './extract-prompt';
import { buildThreadSnapshot } from './thread-snapshot';
import { getReviewAdmission } from './admission';
import { reviewWorkers, type ReviewWorker } from './workers';
import { log } from '../logging';
export class MemoryWorker implements ReviewWorker {
 private suspended=false;
 private disposed=false;
 private active:Promise<void>|undefined;
 private controller:AbortController|undefined;
 constructor(private readonly jobs:MemoryRepository,private readonly extract:(job:MemoryJob,signal:AbortSignal)=>Promise<MemoryResult>){}
 wake():void {if(this.suspended||this.disposed||this.active)return;this.active=this.run().catch(()=>{log({phase:'review-memory-worker',code:'FAILED'});}).finally(()=>{this.active=undefined;});}
 private async run(){
  while(!this.suspended&&!this.disposed){const job=this.jobs.claim();if(!job)return;const controller=new AbortController();this.controller=controller;
   try{const result=await this.extract(job,controller.signal);if(controller.signal.aborted||this.suspended||this.disposed)this.jobs.settle(job,'interrupted');else if(!this.jobs.commit(job.id,job.attemptToken,result))this.jobs.settle(job,'ineligible');}
   catch(error){this.jobs.settle(job,controller.signal.aborted?'interrupted':error instanceof Error && 'errorCode' in error && error.errorCode==='budget'?'budget':'extraction');}
   finally{this.controller=undefined;}
   await new Promise<void>(resolve=>setImmediate(resolve));
  }
 }
 suspend(){this.suspended=true;this.controller?.abort();}
 resume(){if(!this.disposed){this.suspended=false;this.wake();}}
 async waitForIdle(){await this.active;}
 async dispose(){this.disposed=true;this.suspend();await this.waitForIdle();}
 retry(id:string){if(this.suspended||this.disposed)throw new Error('Study memory suspended');this.jobs.retry(id);this.wake();}
}
const services=new WeakMap<Store,MemoryWorker>();
export function wakeMemory(store:Store):void {services.get(store)?.wake();}
export function retryMemoryJob(store:Store,id:string):void {const worker=services.get(store);if(!worker)throw new Error('Study memory unavailable');worker.retry(id);}
/** Called only by normal app composition, never by openStore or staged restore. */
export function startMemory(store:Store,providers:ProviderRegistry):MemoryWorker {
 const existing=services.get(store);if(existing)return existing;
 const jobs=new MemoryRepository(store.db),admission=getReviewAdmission(store);
 const worker=new MemoryWorker(jobs,async(job,signal)=>{
  const snapshot=buildThreadSnapshot(store.db,job.assistantMessageId);
  const courses=jobs.candidates();const choice=jobs.classify(job,snapshot.messages.filter(m=>m.role==='user').map(m=>m.text).join('\n'));
  const courseId=choice?.courseId??null;
  const concepts=courseId?jobs.review.listConcepts({courseId,limit:100}).items:[];
  const units=courseId?jobs.review.listUnits({courseId,limit:100}).items:[];
  const context={messages:snapshot.messages,courses,concepts,units};
  const source=jobs.exchangeContext(job);
  const prompt=buildExtractionPrompt({...context,exchangeId:job.id,chatId:job.conversationId,startedAt:source.startedAt,endedAt:source.endedAt,replyLanguage:store.settings.get().replyLanguage});
  const providerId=providerIdSchema.parse(source.providerId),modelId=source.modelId;
  const output=await admission.execute({purpose:'extraction',adapter:providers.get(providerId),request:{scope:'general',requestId:randomUUID() as import('../../shared/domain').ChatRequest['requestId'],conversationId:job.conversationId as import('../../shared/domain').ChatRequest['conversationId'],providerId,modelId,userMessage:'Extract the study exchange as JSON.',prompt},outputTokens:2048,maxOutputBytes:16384},signal);
  const result=guardExtraction(JSON.parse(output),context);
  if(courseId){result.courseId=courseId;result.confidence=choice!.confidence;}
  return result;
 });
 services.set(store,worker);reviewWorkers.register(worker);jobs.recover();worker.wake();return worker;
}
