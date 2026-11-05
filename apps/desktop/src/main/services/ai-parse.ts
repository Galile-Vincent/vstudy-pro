/**
 * Coordinate budgeted AI page conversion, version persistence, and cancellation.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { atomicWrite } from "../storage/atomic";
import { randomUUID, createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { aiParseRequestSchema, aiParseStateSchema, type AiParseRequest, type AiParseEstimate, type AiParseState } from '../../shared/ai-parse';
import { requestIdSchema, conversationIdSchema, type Document, type Usage } from '../../shared/domain';
import type { Store } from '../db';
import type { ProviderRegistry } from '../providers';
import { validateOptions } from '../providers/models';
import { priceUsage } from '../pricing';
import { AI_PARSE_PROMPT_VERSION, AI_PARSE_SYSTEM, aiParsePrompt } from '../prompt/ai-parse';
import { splitParsePages, validateAiPage } from './ai-parse-gate';
import { containedPath } from './file-paths';
import { SearchService } from './search';
import type { AiPage } from '../../../resources/converter/ai-pages';
const pageRow=z.object({page:z.number(),cacheKey:z.string(),status:z.enum(['pending','running','done','kept-original','failed']),markdown:z.string().nullable(),code:z.string().nullable()});
/** Estimate AI conversion cost using selected pages and known model prices. */
export function estimateParse(pages:string[], modelId:string, images:boolean, overrides:Parameters<typeof priceUsage>[2]={}):Pick<AiParseEstimate,'pages'|'inputTokens'|'outputTokens'|'costUsd'> {
 const inputTokens=pages.reduce((n,p)=>n+Math.ceil((AI_PARSE_SYSTEM.length+aiParsePrompt(p).length)/4)+(images?4096:0),0);
 const outputTokens=pages.reduce((n,p)=>n+Math.max(256,Math.ceil(p.length/3)),0);
 const usage=priceUsage(modelId,{inputTokens,outputTokens,costSource:'estimated'},overrides);
 return {pages:pages.length,inputTokens,outputTokens,...(usage.costUsd===undefined?{}:{costUsd:usage.costUsd})};
}
/** Own budgeted AI conversion jobs and persist accepted page versions atomically. */
export class AiParseService {
 private active=new Map<string,{controller:AbortController; promise:Promise<void>}>();
 private stopped=false;
 constructor(private store:Store, private providers:ProviderRegistry, private render:(source:string,page:number,signal:AbortSignal)=>Promise<AiPage>, private progress:(state:AiParseState)=>void=()=>{}) {
  store.db.exec("UPDATE ai_parse_jobs SET status='cancelled' WHERE status='running'; UPDATE ai_parse_pages SET status='pending' WHERE status='running'");
 }
 private document(id:Document['id']) {const d=this.store.documents.get(id);if(!d || d.status!=='ready')throw new Error('ai_parse.document');return d;}
 private path(d:Document) {return join(containedPath(dirname(dirname(d.sourcePath)),dirname(d.markdownPath)),'content.ai.md');}
 private async pages(d:Document) {const path=containedPath(dirname(d.sourcePath),d.markdownPath);const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>8*1024*1024)throw new Error('ai_parse.size');return splitParsePages(text);}
 private selected(r:AiParseRequest,pages:string[]) {
  const start=r.scope==='all'?1:r.scope==='preview'?1:r.startPage;
  const end=r.scope==='all'?pages.length:r.scope==='preview'?1:r.scope==='currentPage'?start:r.endPage;
  if(!start || !end || start>end || end>pages.length)throw new Error('ai_parse.range');
  return pages.map((markdown,i)=>({page:i+1,markdown})).filter(p=>p.page>=start && p.page<=end);
 }
 async estimate(r:AiParseRequest):Promise<AiParseEstimate> {
  const d=this.document(r.documentId), pages=this.selected(r,await this.pages(d));
  const models=await this.providers.get(r.providerId).listModels();const model=models.find(m=>m.id===r.modelId);
  const supportsImages=model?.supportsImages===true;
  const job=this.store.db.prepare('SELECT request,promptVersion FROM ai_parse_jobs WHERE documentId=?').get(d.id);
  const previous=job?aiParseRequestSchema.parse(JSON.parse(String(job.request))):undefined;
  const reusable=previous?.providerId===r.providerId && previous.modelId===r.modelId && JSON.stringify(previous.options.modelOptions)===JSON.stringify(r.options.modelOptions) && job?.promptVersion===AI_PARSE_PROMPT_VERSION ? new Set(this.rows(d.id).filter(p=>p.status==='done').map(p=>p.page)) : new Set<number>();
  const billable=pages.filter(p=>!reusable.has(p.page));
  return {...estimateParse(billable.map(p=>p.markdown),r.modelId,d.mime==='application/pdf',this.store.settings.get().priceOverrides),pages:pages.length,supportsImages,billing:r.providerId.endsWith('-cli')?'api-equivalent':'api',...((!supportsImages && d.mime==='application/pdf') || r.providerId==='agy-cli'?{reason:model?.imageUnsupportedReason??'ai_parse.images_unsupported'}:{})};
 }
 status(id:Document['id']):AiParseState {
  const d=this.document(id);const job=this.store.db.prepare('SELECT * FROM ai_parse_jobs WHERE documentId=?').get(id);
  const pages=this.rows(id).map(p=>({page:p.page,status:p.status,...(p.code?{code:p.code}:{})}));
  if(!job)return {documentId:id,status:'idle',activeVersion:d.activeVersion,pages};
  const r=aiParseRequestSchema.parse(JSON.parse(String(job.request)));
  return aiParseStateSchema.parse({documentId:id,status:job.status,activeVersion:d.activeVersion,pages,providerId:r.providerId,modelId:r.modelId,promptVersion:job.promptVersion,updatedAt:job.updatedAt});
 }
 private rows(id:string) {return z.array(pageRow).parse(this.store.db.prepare('SELECT * FROM ai_parse_pages WHERE documentId=? ORDER BY page').all(id));}
 async start(r:AiParseRequest):Promise<AiParseState> {
  if(this.stopped)throw new Error('ai_parse.closed');
  if(this.active.has(r.documentId))return this.status(r.documentId);
  // Reserve before asynchronous discovery so concurrent invokes cannot start duplicate jobs.
  const controller=new AbortController();let release!:()=>void;
  const reservation=new Promise<void>(resolve=>{release=resolve;});
  this.active.set(r.documentId,{controller,promise:reservation});
  try {
   const d=this.document(r.documentId), pages=await this.pages(d), estimate=await this.estimate(r);
   if(estimate.reason)throw new Error(estimate.reason);
   const model=(await this.providers.get(r.providerId).listModels()).find(m=>m.id===r.modelId);validateOptions(model,r.options.modelOptions);
   const settings=this.store.settings.get(),spent=this.store.usage.summary('month');
   if(r.options.hardCapUsd!==undefined && (estimate.costUsd===undefined || estimate.costUsd>r.options.hardCapUsd))throw new Error('ai_parse.cap');
   if(settings.monthlyBudgetUsd!==undefined && (spent.unknownPrices || estimate.costUsd===undefined || (spent.costUsd??0)+estimate.costUsd>settings.monthlyBudgetUsd) && !r.options.confirmBudgetOverride)throw new Error('ai_parse.budget');
   if(settings.monthlyTokenBudget!==undefined && spent.inputTokens+spent.outputTokens+estimate.inputTokens+estimate.outputTokens>settings.monthlyTokenBudget && !r.options.confirmBudgetOverride)throw new Error('ai_parse.budget');
   controller.signal.throwIfAborted();
   this.store.db.prepare("INSERT INTO ai_parse_jobs VALUES(?,?,'running',?,?) ON CONFLICT(documentId) DO UPDATE SET request=excluded.request,status='running',updatedAt=excluded.updatedAt,promptVersion=excluded.promptVersion").run(r.documentId,JSON.stringify(r),new Date().toISOString(),AI_PARSE_PROMPT_VERSION);
   for(const p of this.selected(r,pages))this.store.db.prepare("INSERT OR IGNORE INTO ai_parse_pages(documentId,page,cacheKey,status) VALUES(?,?,?,'pending')").run(d.id,p.page,'');
   const promise=this.run(r,d,pages,controller).finally(()=>{this.active.delete(r.documentId);release();});
   this.active.set(r.documentId,{controller,promise});void promise.catch(()=>{});
   return this.status(r.documentId);
  } catch(error) {this.active.delete(r.documentId);release();throw error;}
 }
 private async publish(d:Document,pages:string[]) {
  if(!this.store.documents.get(d.id))return;
  const rows=this.rows(d.id), path=this.path(d);
  const markdown=pages.map((p,i)=>`<!-- page ${i+1} -->\n\n${rows.find(r=>r.page===i+1 && r.status==='done')?.markdown??p}`).join('\n\n');
  if(Buffer.byteLength(markdown)>8*1024*1024)throw new Error('ai_parse.size');
  await atomicWrite(path,markdown);
  await atomicWrite(path+'.json',JSON.stringify({...this.status(d.id),provenance:this.store.db.prepare('SELECT page,provenance FROM ai_parse_pages WHERE documentId=? ORDER BY page').all(d.id)}));
  this.store.db.prepare('UPDATE documents SET aiSizeBytes=? WHERE id=?').run(Buffer.byteLength(markdown),d.id);
  if(this.document(d.id).activeVersion==='ai')new SearchService(this.store.db).update(d.id,markdown);
 }
 private async run(r:AiParseRequest,d:Document,pages:string[],controller:AbortController) {
  const selected=this.selected(r,pages);let cursor=0,reserved=0,actualCost=0;
  const signal=controller.signal;
  const notify=()=>{if(this.store.documents.get(d.id))this.progress(this.status(d.id));};
  const page=async(p:{page:number;markdown:string})=>{
   let key='';let usage:Usage|undefined;let output='';let called=false;
   try {
    signal.throwIfAborted();
    const rendered=d.mime==='application/pdf'?await this.render(d.sourcePath,p.page,signal):undefined;
    key=createHash('sha256').update(rendered?.image??'').update(JSON.stringify([p.markdown,AI_PARSE_PROMPT_VERSION,r.providerId,r.modelId,r.options.modelOptions])).digest('hex');
    const cached=this.store.db.prepare("SELECT markdown FROM ai_parse_pages WHERE cacheKey=? AND status='done' LIMIT 1").get(key);
    this.store.db.prepare("INSERT INTO ai_parse_pages(documentId,page,cacheKey,status,markdown,code) VALUES(?,?,?,'running',NULL,NULL) ON CONFLICT(documentId,page) DO UPDATE SET cacheKey=excluded.cacheKey,status='running',markdown=NULL,code=NULL").run(d.id,p.page,key);notify();
    if(cached?.markdown)output=String(cached.markdown);
    else {
     const cost=estimateParse([p.markdown],r.modelId,!!rendered,this.store.settings.get().priceOverrides).costUsd;
     if(r.options.hardCapUsd!==undefined && (cost===undefined || reserved+cost>r.options.hardCapUsd))throw new Error('ai_parse.cap');reserved+=cost??0;
     called=true;let done=false;
     for await(const event of this.providers.get(r.providerId).stream({requestId:requestIdSchema.parse(randomUUID()),conversationId:conversationIdSchema.parse(randomUUID()),documentId:d.id,providerId:r.providerId,modelId:r.modelId,userMessage:p.markdown||' ',options:r.options.modelOptions,prompt:aiParsePrompt(p.markdown),systemPrompt:AI_PARSE_SYSTEM,allowPresentation:false,...(rendered?{images:[{mediaType:'image/png' as const,data:rendered.image.toString('base64')}]}:{}),onUsageSnapshot:value=>{usage=value;}},signal)) {
      signal.throwIfAborted();
      if(event.type==='text-delta'){output+=event.text;if(Buffer.byteLength(output)>256*1024)throw new Error('ai_parse.size');}
      if(event.type==='usage')usage=event.usage;
      if(event.type==='error' || event.type==='tool-call')throw new Error('ai_parse.provider');
      if(event.type==='done')done=true;
     }
     if(!done)throw new Error('ai_parse.provider');
    }
    signal.throwIfAborted();
    const gate=validateAiPage(rendered?.text??p.markdown,output);
    this.store.db.prepare('UPDATE ai_parse_pages SET status=?,markdown=?,code=? WHERE documentId=? AND page=?').run(gate.accepted?'done':'kept-original',gate.accepted?output:null,gate.accepted?null:'ai_parse.changed_too_much',d.id,p.page);
   } catch {
    this.store.db.prepare("INSERT INTO ai_parse_pages(documentId,page,cacheKey,status,markdown,code) VALUES(?,?,?, ?,NULL,?) ON CONFLICT(documentId,page) DO UPDATE SET status=excluded.status,code=excluded.code,markdown=NULL").run(d.id,p.page,key,signal.aborted?'pending':'failed',signal.aborted?'ai_parse.cancelled':'ai_parse.failed');
   } finally {
    if(called) {
     const measured=priceUsage(r.modelId,usage??{inputTokens:estimateParse([p.markdown],r.modelId,d.mime==='application/pdf').inputTokens,outputTokens:Math.ceil(output.length/3),costSource:'estimated'},this.store.settings.get().priceOverrides);
     actualCost+=measured.costUsd??0;if(r.options.hardCapUsd!==undefined && actualCost>r.options.hardCapUsd)controller.abort();
     this.store.usage.record({...measured,id:randomUUID(),createdAt:new Date().toISOString(),providerId:r.providerId,modelId:r.modelId,kind:'parse',documentId:d.id,aborted:signal.aborted});
    }
    this.store.db.prepare('UPDATE ai_parse_pages SET provenance=? WHERE documentId=? AND page=?').run(JSON.stringify({providerId:r.providerId,modelId:r.modelId,promptVersion:AI_PARSE_PROMPT_VERSION,date:new Date().toISOString()}),d.id,p.page);
    notify();
   }
  };
  try {
   const settled=await Promise.allSettled(Array.from({length:r.options.concurrency},async()=>{while(cursor<selected.length && !signal.aborted){const p=selected[cursor++];if(p)await page(p);}}));
   if(settled.some(result=>result.status==='rejected'))controller.abort();
  } finally {
   this.store.db.prepare('UPDATE ai_parse_jobs SET status=?,updatedAt=? WHERE documentId=?').run(signal.aborted?'cancelled':'complete',new Date().toISOString(),d.id);
   await this.publish(d,pages);notify();
  }
 }
 cancel(id:Document['id']) {this.active.get(id)?.controller.abort();}
 async use(id:Document['id'],version:'original'|'ai') {
  if(this.active.has(id))throw new Error('ai_parse.busy');
  const d=this.document(id);const markdown=await readFile(version==='ai'?containedPath(dirname(this.path(d)),this.path(d)):containedPath(dirname(d.sourcePath),d.markdownPath),'utf8');
  this.store.db.exec('SAVEPOINT ai_version');
  try {this.store.db.prepare('UPDATE documents SET activeVersion=? WHERE id=?').run(version,id);new SearchService(this.store.db).update(id,markdown);this.store.db.exec('RELEASE ai_version');}
  catch(error){this.store.db.exec('ROLLBACK TO ai_version; RELEASE ai_version');throw error;}
  this.progress(this.status(id));
 }
 async discard(id:Document['id']) {if(this.active.has(id))throw new Error('ai_parse.busy');const d=this.document(id);await this.use(id,'original');await rm(this.path(d),{force:true});await rm(this.path(d)+'.json',{force:true});this.store.db.prepare('DELETE FROM ai_parse_jobs WHERE documentId=?').run(id);}
 async dispose() {this.stopped=true;for(const job of this.active.values())job.controller.abort();await Promise.allSettled([...this.active.values()].map(j=>j.promise));}
 async waitForIdle() {await Promise.allSettled([...this.active.values()].map(j=>j.promise));}
}
